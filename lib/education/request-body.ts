import { z } from 'zod';

// Helper for safely parsing JSON request bodies with Zod validation
export async function parseRequestBody<T>(schema: z.ZodSchema<T>, request: Request): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}