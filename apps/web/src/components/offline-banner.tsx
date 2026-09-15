import { WifiSlashIcon } from "@phosphor-icons/react";
import { useOnline } from "@/hooks/use-online";

export const OfflineBanner = () => {
	const online = useOnline();
	if (online) {
		return null;
	}
	return (
		<output className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b bg-destructive px-4 py-2 text-destructive-foreground text-sm">
			<WifiSlashIcon className="size-4" weight="bold" />
			No internet connection.
		</output>
	);
};
