import { DotsThreeIcon, IconContext } from "@phosphor-icons/react";
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
			className="absolute inset-x-0 bottom-0 z-50 flex h-(--inset-bottom) bg-frost pb-[env(safe-area-inset-bottom)] shadow-[0_-0.5px_0_var(--border)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
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
						{({ isActive }) => (
							<>
								<IconContext.Provider
									value={{ weight: isActive ? "fill" : "regular" }}
								>
									<Icon className="size-5" />
								</IconContext.Provider>
								<span>{item.label}</span>
							</>
						)}
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
