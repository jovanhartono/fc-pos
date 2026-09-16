import { createFileRoute, Link } from "@tanstack/react-router";
import { navGroupsForRole } from "@/components/app-navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

export const Route = createFileRoute("/_admin/")({
	component: HomePage,
});

const greetingFor = (hour: number) => {
	if (hour < 11) {
		return "Good morning";
	}
	if (hour < 15) {
		return "Good afternoon";
	}
	return "Good evening";
};

function HomePage() {
	const { me } = Route.useRouteContext();
	const now = dayjs().tz(JAKARTA_TZ);

	return (
		<div>
			<PageHeader
				title={`${greetingFor(now.hour())}, ${me.name}`}
				description={`${now.format("dddd, DD MMM YYYY")} · ${me.role}`}
			/>
			<div className="grid gap-8">
				{navGroupsForRole(me.role).map((group) => (
					<section key={group.label} className="grid gap-3">
						<h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
							{group.label}
						</h2>
						<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{group.items.map((item) => {
								const Icon = item.icon;
								return (
									<li key={item.to}>
										<Card className="h-full py-0 transition-colors hover:bg-accent hover:text-accent-foreground">
											<Link
												to={item.to}
												className="flex h-full flex-col gap-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<span className="flex items-center gap-2 font-medium text-sm">
													<Icon className="size-5" />
													{item.label}
												</span>
												<span className="text-xs/relaxed text-muted-foreground">
													{item.description}
												</span>
											</Link>
										</Card>
									</li>
								);
							})}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}
