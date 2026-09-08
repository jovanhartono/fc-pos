import { useCallback, useEffect, useState } from "react";

const FIX_TIMEOUT_MS = 10_000;
// A fix from moments ago is fine for a 1 km judgement, and refusing one made
// every visit to the screen wait on a cold GPS lock.
const FIX_MAX_AGE_MS = 30_000;

export interface GeolocationCoordinates {
	latitude: number;
	longitude: number;
}

type GeolocationStatus =
	| "skipped"
	| "locating"
	| "ready"
	| "denied"
	| "unavailable";

interface GeolocationState {
	status: GeolocationStatus;
	coordinates?: GeolocationCoordinates;
}

// Splits "the worker said no" from "the phone could not tell us", because the
// two need different wording on the clock-in screen: one is fixed in browser
// settings, the other by trying again. Both stop the clock-in either way.
// "skipped" is the courier, who is never asked at all.
export const useGeolocation = (enabled: boolean) => {
	const [state, setState] = useState<GeolocationState>({
		status: enabled ? "locating" : "skipped",
	});

	const locate = useCallback(() => {
		if (!navigator.geolocation) {
			setState({ status: "unavailable" });
			return;
		}

		setState({ status: "locating" });

		navigator.geolocation.getCurrentPosition(
			(position) =>
				setState({
					status: "ready",
					coordinates: {
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
					},
				}),
			(error) =>
				setState({
					status:
						error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
				}),
			{
				enableHighAccuracy: true,
				maximumAge: FIX_MAX_AGE_MS,
				timeout: FIX_TIMEOUT_MS,
			},
		);
	}, []);

	useEffect(() => {
		if (enabled) {
			locate();
		}
	}, [enabled, locate]);

	return { ...state, retry: locate };
};
