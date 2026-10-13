import { pluralize } from "@/shared/utils";

export const formatDays = (days: number) =>
	days === 0 ? "today" : pluralize(days, "day");

// Customers' numbers are stored as +62812…; wa.me wants the digits only.
export const whatsappUrl = (phone: string) =>
	`https://wa.me/${phone.replace(/\D/g, "")}`;
