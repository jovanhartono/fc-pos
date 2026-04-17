import * as React from "react";

const DESKTOP_BREAKPOINT = 1280;

export function useIsDesktop() {
	const [isDesktop, setIsDesktop] = React.useState(
		() => window.innerWidth >= DESKTOP_BREAKPOINT,
	);

	React.useEffect(() => {
		const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
		const onChange = () => {
			setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
		};
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return isDesktop;
}
