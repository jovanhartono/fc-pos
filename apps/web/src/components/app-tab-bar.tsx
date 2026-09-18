import { DotsThreeIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { NavItem } from "@/components/app-navigation";
import { useSidebar } from "@/components/ui/sidebar";

interface AppTabBarProps {
	items: readonly NavItem[];
}

// The active colour rides a data attribute, not a second class: two plain
// text-* classes would leave the winner up to stylesheet order.
const tabClassName =
	"flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground leading-none transition-colors data-[active=true]:text-foreground";

export const AppTabBar = ({ items }: AppTabBarProps) => {
	const { openMobile, setOpenMobile } = useSidebar();

	return (
		<nav
			aria-label="Primary"
			className="flex shrink-0 border-sidebar-border/70 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
		>
			{items.map((item) => {
				const Icon = item.icon;

				return (
					<Link
						activeProps={{ "data-active": "true" }}
						className={tabClassName}
						key={item.to}
						to={item.to}
					>
						<Icon className="size-5" />
						<span>{item.label}</span>
					</Link>
				);
			})}
			<button
				aria-expanded={openMobile}
				aria-haspopup="dialog"
				className={tabClassName}
				onClick={() => setOpenMobile(true)}
				type="button"
			>
				<DotsThreeIcon className="size-5" />
				<span>More</span>
			</button>
		</nav>
	);
};
