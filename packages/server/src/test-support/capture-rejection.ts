// Returns the rejection reason so a test can assert on both the error class
// and its message. Bun's `.rejects.toThrow()` checks one or the other per call;
// handing back the error keeps those two assertions on one awaited promise.
export const captureRejection = async (
  promise: Promise<unknown>
): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject, but it resolved");
};
