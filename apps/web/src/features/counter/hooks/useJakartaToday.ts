import { useEffect, useState } from "react";
import { jakartaToday } from "@/shared/date-presets";

// An iPad left on today's close past midnight moves on to the new day.
export const useJakartaToday = () => {
	const [today, setToday] = useState(jakartaToday);
	useEffect(() => {
		const timer = setInterval(() => setToday(jakartaToday()), 60_000);
		return () => clearInterval(timer);
	}, []);
	return today;
};
