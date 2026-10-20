import { Badge } from "@/components/ui/badge";

interface ActiveBadgeProps {
	isActive: boolean;
}

// Active is how nearly every record sits, so only the switched-off one is marked.
export const ActiveBadge = ({ isActive }: ActiveBadgeProps) =>
	isActive ? null : <Badge variant="danger">Inactive</Badge>;
