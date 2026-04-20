import { useEffect } from "react";
import { useSheet } from "@/stores/sheet-store";

export const useSheetDirtyGuard = (isDirty: boolean) => {
	const setDirty = useSheet((state) => state.setDirty);

	useEffect(() => {
		setDirty(isDirty);
		return () => setDirty(false);
	}, [isDirty, setDirty]);
};
