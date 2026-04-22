import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

interface ExportButtonProps {
	disabled?: boolean;
	onClick: () => void;
}

export const ExportButton = ({ disabled, onClick }: ExportButtonProps) => {
	const isMobile = useIsMobile();
	if (isMobile) {
		return (
			<Button
				type="button"
				variant="outline"
				disabled={disabled}
				onClick={onClick}
				size="icon"
				aria-label="Export CSV"
			>
				<DownloadSimpleIcon />
			</Button>
		);
	}
	return (
		<Button
			type="button"
			variant="outline"
			disabled={disabled}
			onClick={onClick}
			icon={<DownloadSimpleIcon />}
		>
			Export CSV
		</Button>
	);
};
