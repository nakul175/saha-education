// NFR-01: reject oversized streamed input before schema validation and persistence.
import assert from 'node:assert/strict';
import { load } from '../support/security-db.mjs';
import { z } from 'zod';
const { body, MAX_JSON_BODY_BYTES } = await load('lib/education/http.ts');
const schema = z.object({ text: z.string() }).strict();
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log('ok - ' + name); };
const request = (value, headers = {}) => new Request('https://education.example.invalid/api/test', { method: 'POST', headers, body: value });
await check('Valid UTF8 JSON retains text', async () => assert.deepEqual(await body(request('{"text":"पठन"}'), schema), {text:'पठन'}));
await check('Malformed JSON rejected', async () => assert.rejects(body(request('{broken'), schema), SyntaxError));
await check('Absent body rejected', async () => assert.rejects(body(request(undefined), schema), SyntaxError));
await check('Authority field rejected by strict schema', async () => assert.rejects(body(request('{"text":"x","schoolId":"b"}'), schema), z.ZodError));
await check('Unbounded declared length rejected', async () => assert.rejects(body(request('{"text":"x"}', {'content-length':String(MAX_JSON_BODY_BYTES + 1)}), schema), SyntaxError));
await check('Malformed declared length rejected', async () => assert.rejects(body(request('{"text":"x"}', {'content-length':'-1'}), schema), SyntaxError));
await check('Actual bytes checked despite smaller declared length', async () => assert.rejects(body(request(JSON.stringify({text:'x'.repeat(MAX_JSON_BODY_BYTES)}), {'content-length':'1'}), schema), SyntaxError));
await check('Multibyte content bounded by bytes', async () => assert.rejects(body(request(JSON.stringify({text:'प'.repeat(MAX_JSON_BODY_BYTES / 2)})), schema), SyntaxError));
await check('Exact limit accepted', async () => assert.equal((await body(request(JSON.stringify({text:'x'.repeat(MAX_JSON_BODY_BYTES - 11)})), schema)).text.length, MAX_JSON_BODY_BYTES - 11));
await check('Split multibyte chunks decoded intact', async () => {
  const bytes = new TextEncoder().encode('{"text":"पठन"}');
  const stream = new ReadableStream({start(controller) {for(const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();}});
  assert.equal((await body(new Request('https://education.example.invalid/api/test', {method:'POST', body:stream, duplex:'half'}), schema)).text, 'पठन');
});
await check('Oversized stream cancelled before final chunk', async () => {
  let cancelled = false;
  const stream = new ReadableStream({pull(controller) {controller.enqueue(new Uint8Array(65536));}, cancel() {cancelled = true;}});
  await assert.rejects(body(new Request('https://education.example.invalid/api/test', {method:'POST', body:stream, duplex:'half'}), schema), SyntaxError);
  assert.equal(cancelled, true);
});
await check('Invalid UTF8 rejected', async () => assert.rejects(body(request(new Uint8Array([123,34,116,101,120,116,34,58,34,255,34,125])), schema), SyntaxError));
console.log(JSON.stringify({passed, failed:0, skipped:0}));
