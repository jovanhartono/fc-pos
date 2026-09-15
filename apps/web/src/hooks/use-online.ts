import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export const useOnline = () =>
	useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () =>
		onlineManager.isOnline(),
	);
