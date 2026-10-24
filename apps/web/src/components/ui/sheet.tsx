import { Drawer as SheetPrimitive } from "@base-ui/react/drawer";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type ComponentProps,
	createContext,
	useContext,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { useBlockEdgeSwipe } from "@/hooks/useBlockEdgeSwipe";
import { cn } from "@/lib/utils";

type SheetSide = "top" | "right" | "bottom" | "left";

const SWIPE_DIRECTION = {
	top: "up",
	right: "right",
	bottom: "down",
	left: "left",
} as const satisfies Record<
	SheetSide,
	SheetPrimitive.Root.Props["swipeDirection"]
>;

const SheetSideContext = createContext<SheetSide>("right");

interface SheetProps extends SheetPrimitive.Root.Props {
	side?: SheetSide;
}

const Sheet = ({ side = "right", ...props }: SheetProps) => (
	<SheetSideContext.Provider value={side}>
		<SheetPrimitive.Root
			data-slot="sheet"
			swipeDirection={SWIPE_DIRECTION[side]}
			{...props}
		/>
	</SheetSideContext.Provider>
);

const SheetTrigger = (props: SheetPrimitive.Trigger.Props) => (
	<SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
);

const SheetClose = (props: SheetPrimitive.Close.Props) => (
	<SheetPrimitive.Close data-slot="sheet-close" {...props} />
);

const SheetOverlay = ({
	className,
	...props
}: SheetPrimitive.Backdrop.Props) => (
	<SheetPrimitive.Backdrop
		data-slot="sheet-overlay"
		className={cn(
			"fixed inset-0 z-50 bg-black/10 text-footnote/relaxed opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs",
			className,
		)}
		{...props}
	/>
);

interface SheetContentProps extends SheetPrimitive.Popup.Props {
	showCloseButton?: boolean;
}

const SheetContent = ({
	className,
	children,
	showCloseButton = true,
	...props
}: SheetContentProps) => {
	const side = useContext(SheetSideContext);
	const [popupNode, setPopupNode] = useState<HTMLDivElement | null>(null);
	useBlockEdgeSwipe(popupNode);

	const portal = (
		<SheetPrimitive.Portal data-slot="sheet-portal">
			<SheetOverlay />
			<SheetPrimitive.Viewport data-slot="sheet-viewport">
				<SheetPrimitive.Popup
					data-slot="sheet-content"
					data-side={side}
					className={cn(
						"fixed z-50 flex flex-col bg-popover bg-clip-padding dark:bg-background text-footnote/relaxed text-popover-foreground shadow-lg transition duration-200 ease-in-out data-swiping:duration-0 [transform:translate(var(--drawer-swipe-movement-x),var(--drawer-swipe-movement-y))] data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-xl data-[side=bottom]:rounded-t-xl data-[side=top]:rounded-b-xl data-[side=left]:rounded-r-xl data-[side=right]:sm:rounded-l-xl",
						className,
					)}
					ref={setPopupNode}
					{...props}
				>
					{/* A mouse drag selects text (an Order code, a phone number) instead
					    of dragging the sheet; only touch swipes it away. */}
					<SheetPrimitive.Content className="contents">
						{children}
					</SheetPrimitive.Content>
					{showCloseButton ? (
						<SheetPrimitive.Close
							data-slot="sheet-close"
							render={
								<Button
									variant="ghost"
									className="absolute top-3 right-3"
									size="icon-sm"
								/>
							}
						>
							<HugeiconsIcon icon={Cancel01Icon} />
							<span className="sr-only">Close</span>
						</SheetPrimitive.Close>
					) : null}
				</SheetPrimitive.Popup>
			</SheetPrimitive.Viewport>
		</SheetPrimitive.Portal>
	);

	// The POS Cart's fields sit low in a bottom sheet; this keeps the one being
	// typed into above the iPhone keyboard.
	if (side === "bottom") {
		return (
			<SheetPrimitive.VirtualKeyboardProvider>
				{portal}
			</SheetPrimitive.VirtualKeyboardProvider>
		);
	}
	return portal;
};

const SheetHeader = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		data-slot="sheet-header"
		className={cn("flex flex-col gap-0.5 p-4", className)}
		{...props}
	/>
);

const SheetFooter = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		data-slot="sheet-footer"
		className={cn(
			"mt-auto flex flex-col gap-2 p-4 pb-[calc(var(--inset-bottom)+1rem)]",
			className,
		)}
		{...props}
	/>
);

const SheetTitle = ({ className, ...props }: SheetPrimitive.Title.Props) => (
	<SheetPrimitive.Title
		data-slot="sheet-title"
		className={cn("text-body font-medium text-foreground", className)}
		{...props}
	/>
);

const SheetDescription = ({
	className,
	...props
}: SheetPrimitive.Description.Props) => (
	<SheetPrimitive.Description
		data-slot="sheet-description"
		className={cn("text-footnote/relaxed text-muted-foreground", className)}
		{...props}
	/>
);

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
};
