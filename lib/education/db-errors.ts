/** True when a database error (or any error in its cause chain) is a unique or primary-key violation. */
export function uniqueFailure(error: unknown, alsoMatching?: RegExp): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message) ||
    (alsoMatching?.test(error.message) ?? false) ||
    uniqueFailure(error.cause, alsoMatching)
  );
}
