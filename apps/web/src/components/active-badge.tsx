import { Badge } from "@/components/ui/badge";

interface ActiveBadgeProps {
	isActive: boolean;
}

export const ActiveBadge = ({ isActive }: ActiveBadgeProps) =>
	isActive ? (
		<Badge variant="success">Active</Badge>
	) : (
		<Badge variant="danger">Inactive</Badge>
	);
