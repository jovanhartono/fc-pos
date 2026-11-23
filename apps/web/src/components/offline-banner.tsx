import { WifiOff01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

// Mounted while online too, empty: VoiceOver reads a status that changes, not
// one that arrives with its text, so a cashier mid-order hears the drop.
export const OfflineBanner = () => {
  const online = useOnline();
  return (
    <output
      className={cn(
        !online &&
          "text-destructive-foreground sticky top-0 z-50 flex items-center justify-center gap-2 border-b bg-destructive px-4 py-2 text-body"
      )}
    >
      {online ? null : (
        <>
          <HugeiconsIcon
            icon={WifiOff01Icon}
            className="size-4"
            strokeWidth={2}
          />
          No internet connection.
        </>
      )}
    </output>
  );
};
