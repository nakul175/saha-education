import { z } from 'zod';

// Helper for safely parsing JSON request bodies with Zod validation
export async function parseRequestBody<T>(schema: z.ZodSchema<T>, request: Request): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}

// Helper for parsing request bodies with default error handling
export async function parseRequestBodyWithErrorHandling<T>(
  schema: z.ZodSchema<T>,
  request: Request,
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: `Validation failed: ${error.issues.map(i => i.message).join(', ')}` 
      };
    }
    return { success: false, error: 'Invalid request body' };
  }
}

// Helper for parsing form data
export async function parseFormData<T>(schema: z.ZodSchema<T>, request: Request): Promise<T> {
  const formData = await request.formData();
  const rawObject: Record<string, unknown> = {};
  
  for (const [key, value] of formData.entries()) {
    rawObject[key] = value;
  }
  
  return schema.parse(rawObject);
}

// Helper for parsing URL search parameters
export function parseSearchParams<T>(schema: z.ZodSchema<T>, params: URLSearchParams): T {
  const rawObject: Record<string, unknown> = {};
  
  for (const [key, value] of params.entries()) {
    // Handle multiple values (e.g., ?tag=foo&tag=bar)
    if (rawObject[key]) {
      if (Array.isArray(rawObject[key])) {
        (rawObject[key] as string[]).push(value);
      } else {
        rawObject[key] = [rawObject[key], value];
      }
    } else {
      rawObject[key] = value;
    }
  }
  
  return schema.parse(rawObject);
}