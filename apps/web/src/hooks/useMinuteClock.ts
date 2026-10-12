import { useEffect, useState } from "react";

// One tick a minute for a whole list (queue ages, today's Last move), never a timer per row.
export const useMinuteClock = (): number => {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(interval);
	}, []);

	return now;
};
