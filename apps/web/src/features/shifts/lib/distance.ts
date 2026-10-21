// Beside the Store the clock-in screen picked. One decimal, like the server's
// refusal, so a worker turned away never reads two numbers for the same walk.
export const formatDistanceKm = (km: number) =>
	km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
