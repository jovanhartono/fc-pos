// True when a thrown DB error is a Postgres unique-violation (SQLSTATE 23505).
// The code can sit on the error itself or on `error.cause` depending on the
// driver/wrapper, so both shapes are checked. Used by services that recover
// from a unique race (find-or-create) rather than letting the global onError
// handler map it to a 409.
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return (cause as { code?: string }).code === "23505";
  }
  return "code" in error && (error as { code?: string }).code === "23505";
}
