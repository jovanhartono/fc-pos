import type { PropsWithChildren } from "react";

// A row of chips that outgrows its container — /queue's six statuses and the POS
// catalog's ten categories both do. The mask fades the last chip out instead of
// slicing it mid-word, which read as a broken layout rather than as "there is
// more this way". Unconditional, not phone-only: whether the strip overflows
// depends on the container — the expanded sidebar cuts it at 1024 too — and when
// it does fit the fade lands on empty padding.
export const ChipStripScroller = ({ children }: PropsWithChildren) => (
	<div className="-mx-1 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
		{children}
	</div>
);

// The row inside the scroller stays with each caller: /queue's chips are a
// tablist, the catalog's are a fieldset of toggles, and flattening that into one
// element would trade the screen reader's answer for a shared wrapper. Only the
// measurements travel — pr-8 is what keeps the last chip clear of the fade.
export const CHIP_STRIP_ROW = "flex min-w-max gap-2 px-1 pr-8";
