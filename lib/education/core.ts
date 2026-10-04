import { z } from 'zod';

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new AppError(status, message);
}

export const uuid = () => crypto.randomUUID();

// Simple helper to check if a value is a valid date string
export function isValidDateString(dateString: string): boolean {
  return !isNaN(Date.parse(dateString));
}

// Get current date in ISO format
export function now(): string {
  return new Date().toISOString();
}