// Shown under the branch the clock-in screen picked, so a worker can tell at a
// glance that it chose the counter they are standing at: metres up close,
// kilometres beyond.
export const formatDistanceKm = (km: number) =>
	km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
