// Shown beside the branch the clock-in screen picked, so a worker can tell at a
// glance that it chose the counter they are standing at: metres up close,
// kilometres beyond. One decimal, matching the server's refusal message, so a
// worker turned away does not read two different numbers for the same walk.
export const formatDistanceKm = (km: number) =>
	km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
