import { fail } from './core';
import type { ZodSchema } from 'zod';

// Bound bytes while streaming; a post-read length check alone permits memory exhaustion.
export async function boundedJsonBody(request: Request, maxBytes: number) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    fail(413, 'This command is too large.');
  }
  
  const reader = request.body?.getReader();
  if (!reader) {
    fail(400, 'A JSON body is required.');
  }
  
  const chunks: Uint8Array[] = [];
  let size = 0;
  
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        fail(413, 'This command is too large.');
      }
      
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  
  const buffer = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, at);
    at += chunk.byteLength;
  }
  
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch {
    fail(400, 'Invalid JSON.');
  }
}

// Safe parsing of request body with Zod schema validation
export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await boundedJsonBody(request, 1024 * 1024); // 1MB limit
  const result = schema.safeParse(body);
  
  if (!result.success) {
    fail(400, `Invalid request body: ${result.error.issues.map(i => i.message).join(', ')}`);
  }
  
  return result.data;
}