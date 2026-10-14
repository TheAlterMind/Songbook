export class LyricsError extends Error {
  constructor(code, message, status = 502, retryAfterSeconds) {
    super(message);
    this.name = 'LyricsError';
    Object.assign(this, { code, status, retryAfterSeconds });
  }
}
export function abortError() {
  const error = new Error('Lyrics lookup cancelled.');
  error.name = 'AbortError';
  return error;
}
export function throwIfAborted(signal) { if (signal?.aborted) throw abortError(); }

function pause(ms, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(done, ms);
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abortError()); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
function retryDelay(value) {
  if (value && /^\d+$/.test(value.trim())) return Math.min(86400, Number(value));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(86400, Math.max(1, Math.ceil((date - Date.now()) / 1000))) : 60;
}

// One app-scoped client coordinates every provider request on this device.
// The native entry point injects expo/fetch; tests inject a fixture transport.
export class HttpClient {
  constructor({ fetchImpl = fetch, intervalMs = 300, timeoutMs = 12000,
    userAgent = 'Songbook/1.0 (https://github.com/TheAlterMind/Songbook)' } = {}) {
    Object.assign(this, { fetchImpl, intervalMs, timeoutMs, userAgent });
    this.hosts = new Map();
  }
  withSignal(signal) {
    return { request: (url, options = {}) => this.request(url, { ...options, signal }) };
  }
  async request(url, { headers = {}, json = true, method = 'GET', body, signal } = {}) {
    throwIfAborted(signal);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new LyricsError('INVALID_URL', 'Lyrics providers require a secure source URL.', 400);
    }
    const host = parsed.host;
    if (!this.hosts.has(host)) this.hosts.set(host, { tail: Promise.resolve(), next: 0, cooldown: 0 });
    const state = this.hosts.get(host);
    const operation = state.tail.then(async () => {
      throwIfAborted(signal);
      const remaining = Math.ceil((state.cooldown - Date.now()) / 1000);
      if (remaining > 0) throw new LyricsError('RATE_LIMITED', `${host} is busy. Try again in ${remaining} seconds.`, 429, remaining);
      if (state.next > Date.now()) await pause(state.next - Date.now(), signal);
      throwIfAborted(signal);
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
      try {
        const { fetchImpl } = this;
        const response = await fetchImpl(url, {
          method, ...(body === undefined ? {} : { body }),
          headers: { 'User-Agent': this.userAgent, Accept: json ? 'application/json' : 'text/html', ...headers },
          signal: controller.signal, redirect: 'manual', credentials: 'omit',
        });
        throwIfAborted(signal);
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429 || response.status === 503) {
            const seconds = retryDelay(response.headers.get('retry-after'));
            state.cooldown = Date.now() + seconds * 1000;
            throw new LyricsError('RATE_LIMITED', `${host} is busy. Try again in ${seconds} seconds.`, 429, seconds);
          }
          if (response.status === 404) throw new LyricsError('NOT_FOUND', 'This song was not found at the provider.', 404);
          if (response.status === 401 || response.status === 403) throw new LyricsError('ACCESS_DENIED', `${host} denied access.`, 502);
          throw new LyricsError('UPSTREAM_ERROR', `${host} returned HTTP ${response.status}.`, 502);
        }
        const reader = response.body?.getReader();
        if (!reader) throw new LyricsError('INVALID_RESPONSE', 'The provider returned an empty response.');
        const chunks = [];
        let size = 0;
        while (true) {
          throwIfAborted(signal);
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) {
            controller.abort();
            try { await reader.cancel(); } catch { /* Native abort may already have closed the stream. */ }
            throw new LyricsError('RESPONSE_TOO_LARGE', 'The provider response was too large.');
          }
          chunks.push(value);
        }
        throwIfAborted(signal);
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const text = new TextDecoder().decode(bytes);
        if (!json) return text;
        try { return JSON.parse(text); }
        catch { throw new LyricsError('INVALID_RESPONSE', 'The provider returned invalid JSON.'); }
      } catch (error) {
        throwIfAborted(signal);
        if (error instanceof LyricsError) throw error;
        if (timedOut || error.name === 'TimeoutError') throw new LyricsError('TIMEOUT', `${host} did not respond in time.`, 504);
        throw new LyricsError('NETWORK_ERROR', `Could not reach ${host}. Check the connection and try again.`, 502);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        state.next = Date.now() + this.intervalMs;
      }
    });
    state.tail = operation.catch(() => {});
    // Aborting a queued lookup returns immediately, even if another lookup is
    // still using this host. Its queued operation checks the signal before I/O.
    if (!signal) return operation;
    return new Promise((resolve, reject) => {
      const cancel = () => reject(abortError());
      signal.addEventListener('abort', cancel, { once: true });
      operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
      if (signal.aborted) cancel();
    });
  }
}
