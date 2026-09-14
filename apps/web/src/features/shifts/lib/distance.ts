import { CLOCK_IN_RADIUS_KM } from "@fresclean/api/schema";

// The worker's screen and the manager's table quote the same clock-in
// distance, so they read it the same way: metres up close, kilometres beyond.
export const formatDistanceKm = (km: number) =>
	km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;

export const isOutOfClockInRange = (km: number) => km > CLOCK_IN_RADIUS_KM;
