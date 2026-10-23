import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { NavItem } from "@/components/app-navigation";
import { useSidebar } from "@/components/ui/sidebar";

interface AppTabBarProps {
	items: readonly NavItem[];
}

// The active colour rides a data attribute, not a second class: two plain
// text-* classes would leave the winner up to stylesheet order.
const tabClassName =
	"flex flex-1 flex-col items-center justify-center gap-1 text-caption text-muted-foreground leading-none transition-colors data-[active=true]:text-primary";

export const AppTabBar = ({ items }: AppTabBarProps) => {
	const { openMobile, setOpenMobile } = useSidebar();

	return (
		<nav
			aria-label="Primary"
			data-slot="tab-bar"
			className="absolute inset-x-0 bottom-0 z-50 flex h-(--inset-bottom) bg-frost pb-[env(safe-area-inset-bottom)] shadow-[0_-0.5px_0_var(--border)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
		>
			{items.map((item) => (
				<Link
					activeProps={{ "data-active": "true" }}
					className={tabClassName}
					key={item.to}
					to={item.to}
				>
					<HugeiconsIcon className="size-5" icon={item.icon} />
					<span>{item.label}</span>
				</Link>
			))}
			<button
				aria-expanded={openMobile}
				aria-haspopup="dialog"
				className={tabClassName}
				onClick={() => setOpenMobile(true)}
				type="button"
			>
				<HugeiconsIcon className="size-5" icon={MoreHorizontalIcon} />
				<span>More</span>
			</button>
		</nav>
	);
};
