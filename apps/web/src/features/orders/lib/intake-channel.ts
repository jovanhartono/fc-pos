import type { ComboboxOption } from "@/components/ui/combobox";
import type { IntakeChannel } from "@/lib/api";

export const INTAKE_CHANNEL_ITEMS: ComboboxOption[] = [
	{ value: "walk_in", label: "Walk-in (over the counter)" },
	{ value: "courier", label: "Collected by our courier" },
	{ value: "shipped", label: "Shipped in (JNE, J&T, …)" },
];

interface IntakeChannelCarries {
	courier: boolean;
	origin: boolean;
}

// What each way in is allowed to carry. Both the POS and the order-detail edit
// read this, to hide the fields that do not apply and to clear whatever the
// previous channel left behind — the server and the database reject any other
// combination (ADR-0020).
export const intakeChannelCarries = (
	channel: IntakeChannel,
): IntakeChannelCarries => ({
	courier: channel === "courier",
	origin: channel !== "walk_in",
});
