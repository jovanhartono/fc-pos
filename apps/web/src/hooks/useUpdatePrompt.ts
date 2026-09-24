import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { toast } from "sonner";

export const useUpdatePrompt = () => {
	const {
		needRefresh: [needRefresh],
		updateServiceWorker,
	} = useRegisterSW();

	useEffect(() => {
		if (!needRefresh) {
			return;
		}
		toast("Update ready", {
			duration: Number.POSITIVE_INFINITY,
			action: { label: "Reload", onClick: () => void updateServiceWorker() },
		});
	}, [needRefresh, updateServiceWorker]);
};
