import { useEffect, useRef, useState } from "react";

export const useElementWidth = () => {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const node = ref.current;
		if (!node) {
			return;
		}
		const observer = new ResizeObserver(([entry]) =>
			setWidth(Math.floor(entry.contentRect.width)),
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
};
