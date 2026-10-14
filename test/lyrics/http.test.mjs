import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpClient } from '../../src/lyrics/core/http.js';

const errorCode = (code, status) => error => {
  assert.equal(error.code, code);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
};
const response = (value, init) => new Response(JSON.stringify(value), init);

test('transport negotiates JSON or HTML, supplies identification, and does not follow redirects', async () => {
  const calls = [];
  const client = new HttpClient({ intervalMs: 0, userAgent: 'TestRunner/1', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return options.headers.Accept === 'text/html' ? new Response('<p>Fixture</p>') : response({ ok: true });
  } });
  assert.deepEqual(await client.request('https://provider.example/api'), { ok: true });
  assert.equal(await client.request('https://provider.example/page', { json: false }), '<p>Fixture</p>');
  assert.equal(calls[0].options.headers['User-Agent'], 'TestRunner/1');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
  assert.equal(calls[1].options.headers.Accept, 'text/html');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('invalid JSON is reported as an upstream error and does not poison the host queue', async () => {
  let calls = 0;
  const client = new HttpClient({ intervalMs: 0, fetchImpl: async () => ++calls === 1
    ? new Response('<html>Unexpected proxy response</html>') : response({ recovered: true }) });
  await assert.rejects(client.request('https://provider.example/first'), errorCode('INVALID_RESPONSE', 502));
  assert.deepEqual(await client.request('https://provider.example/second'), { recovered: true });
});

test('POST requests forward JSON bytes while preserving transport safeguards and leaving later GETs clean', async () => {
  const calls = [];
  const client = new HttpClient({ intervalMs: 0, userAgent: 'TestRunner/1', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return response({ ok: true });
  } });
  const body = JSON.stringify({ query: 'Паперові супутники & rain', context: { client: { clientName: 'FIXTURE' } } });
  await client.request('https://provider.example/search', {
    method: 'POST', body, headers: { 'Content-Type': 'application/json' },
  });
  await client.request('https://provider.example/song');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, body);
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.headers['User-Agent'], 'TestRunner/1');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.method || 'GET', 'GET');
  assert.equal(calls[1].options.body, undefined);
  assert.equal(calls[1].options.headers['Content-Type'], undefined);
});

test('rate-limit cooldown prevents another request to the same host but leaves other hosts available', async () => {
  const calls = [];
  const client = new HttpClient({ intervalMs: 0, fetchImpl: async url => {
    calls.push(url);
    return url.includes('limited.example')
      ? new Response('', { status: 429, headers: { 'Retry-After': '60' } })
      : response({ ok: true });
  } });
  await assert.rejects(client.request('https://limited.example/a'), error => {
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterSeconds, 60);
    return true;
  });
  await assert.rejects(client.request('https://limited.example/b'), error => {
    assert.equal(error.code, 'RATE_LIMITED');
    assert.ok(error.retryAfterSeconds > 0);
    return true;
  });
  assert.deepEqual(await client.request('https://available.example/c'), { ok: true });
  assert.equal(calls.length, 2);
});

test('HTTP-date cooldowns and missing Retry-After values are understood', async () => {
  for (const retryAfter of [new Date(Date.now() + 120_000).toUTCString(), undefined]) {
    const client = new HttpClient({ intervalMs: 0, fetchImpl: async () => new Response('', {
      status: 503, headers: retryAfter ? { 'Retry-After': retryAfter } : {},
    }) });
    await assert.rejects(client.request('https://provider.example/a'), error => {
      assert.equal(error.code, 'RATE_LIMITED');
      assert.ok(error.retryAfterSeconds >= 59 && error.retryAfterSeconds <= 120);
      return true;
    });
  }
});

test('provider status codes remain actionable and redirects are errors', async () => {
  for (const [status, code, expectedStatus] of [
    [404, 'NOT_FOUND', 404], [401, 'ACCESS_DENIED', 502], [403, 'ACCESS_DENIED', 502],
    [500, 'UPSTREAM_ERROR', 502], [302, 'UPSTREAM_ERROR', 502],
  ]) {
    let calls = 0;
    const client = new HttpClient({ intervalMs: 0, fetchImpl: async () => {
      calls++;
      return new Response('', { status, headers: { Location: 'https://other.example/' } });
    } });
    await assert.rejects(client.request('https://provider.example/a'), errorCode(code, expectedStatus));
    assert.equal(calls, 1);
  }
});

test('timeouts are typed and network internals are not leaked to callers', async () => {
  const timeout = new HttpClient({ intervalMs: 0, timeoutMs: 10, fetchImpl: async (url, { signal }) => {
    await delay(1_000, undefined, { signal });
  } });
  await assert.rejects(timeout.request('https://provider.example/a'), errorCode('TIMEOUT', 504));
  const broken = new HttpClient({ intervalMs: 0, fetchImpl: async () => { throw new Error('private-network-detail'); } });
  await assert.rejects(broken.request('https://provider.example/a'), error => {
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.message.includes('private-network-detail'), false);
    return true;
  });
});

test('same-host requests wait for the first response body, while another host can progress', async () => {
  let releaseBody;
  let firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  const bodyReady = new Promise(resolve => { releaseBody = resolve; });
  const calls = [];
  const client = new HttpClient({ intervalMs: 0, fetchImpl: async url => {
    calls.push(url);
    if (url.endsWith('/first')) {
      firstStarted();
      return new Response(new ReadableStream({
        async start(controller) {
          await bodyReady;
          controller.enqueue(new TextEncoder().encode('{"first":true}'));
          controller.close();
        },
      }));
    }
    return response({ ok: true });
  } });
  const first = client.request('https://provider.example/first');
  await started;
  const second = client.request('https://provider.example/second');
  const other = await client.request('https://other.example/third');
  assert.deepEqual(other, { ok: true });
  assert.deepEqual(calls, ['https://provider.example/first', 'https://other.example/third']);
  releaseBody();
  assert.deepEqual(await first, { first: true });
  assert.deepEqual(await second, { ok: true });
  assert.equal(calls[2], 'https://provider.example/second');
});

test('oversized streaming responses are canceled even without Content-Length', async () => {
  let canceled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { canceled = true; },
  });
  const client = new HttpClient({ intervalMs: 0, fetchImpl: async () => new Response(body) });
  await assert.rejects(client.request('https://provider.example/a'), errorCode('RESPONSE_TOO_LARGE', 502));
  assert.equal(canceled, true);
});
