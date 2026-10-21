import { WifiOff01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useOnline } from "@/hooks/use-online";

export const OfflineBanner = () => {
	const online = useOnline();
	if (online) {
		return null;
	}
	return (
		<output className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b bg-destructive px-4 py-2 text-destructive-foreground text-body">
			<HugeiconsIcon icon={WifiOff01Icon} className="size-4" strokeWidth={2} />
			No internet connection.
		</output>
	);
};
