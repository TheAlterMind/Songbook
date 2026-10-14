import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpClient } from '../../src/lyrics/core/http.js';
import { decodeUtf8Base64Url, encodeUtf8Base64Url } from '../../src/lyrics/core/encoding.js';

test('native requests omit ambient cookies, preserve explicit provider headers and reject redirects', async () => {
  let init;
  const client = new HttpClient({ intervalMs: 0, fetchImpl: async (_, value) => { init = value; return new Response('{}'); } });
  await client.request('https://music.youtube.com/fixture', { headers: { Cookie: 'SOCS=CAI', Origin: 'https://music.youtube.com' } });
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.headers.Cookie, 'SOCS=CAI');
  assert.equal(init.headers.Origin, 'https://music.youtube.com');
});

test('cancelling a queued same-host request returns promptly without issuing that request later', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const calls = [];
  const client = new HttpClient({ intervalMs: 0, fetchImpl: async url => { calls.push(url); await gate; return new Response('{}'); } });
  const active = client.request('https://provider.example/first');
  await delay(0);
  const controller = new AbortController();
  const queued = client.request('https://provider.example/second', { signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, { name: 'AbortError' });
  assert.equal(calls.length, 1);
  finish(); await active; await delay(0);
  assert.equal(calls.length, 1);
});

test('cancelling an active request aborts the injected native fetch and is not reported as timeout', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let nativeAborted = false;
  const client = new HttpClient({ intervalMs: 0, fetchImpl: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { nativeAborted = true; reject(new Error('Native cancelled')); }, { once: true });
    started();
  }) });
  const controller = new AbortController();
  const pending = client.withSignal(controller.signal).request('https://provider.example/fixture');
  await ready; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(nativeAborted, true);
});

test('UTF-8 decoding preserves code points split across response chunks without Node Buffer', async () => {
  const text = 'Паперові супутники 🌙';
  const bytes = new TextEncoder().encode(text);
  const client = new HttpClient({ intervalMs: 0, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); },
  })) });
  assert.equal(await client.request('https://provider.example/text', { json: false }), text);
});

test('metadata encoding is compatible, Unicode-safe and rejects noncanonical encodings', () => {
  const text = JSON.stringify(['Пісня', '🌙', '日本語', '']);
  assert.equal(encodeUtf8Base64Url(text), Buffer.from(text).toString('base64url'));
  assert.equal(decodeUtf8Base64Url(encodeUtf8Base64Url(text)), text);
  assert.throws(() => decodeUtf8Base64Url('a'));
  assert.throws(() => decodeUtf8Base64Url('AB'));
  assert.throws(() => decodeUtf8Base64Url('a==='));
});
