import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { navGroupsForRole } from "@/components/app-navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

const HomePage = () => {
  const { me } = Route.useRouteContext();
  const now = dayjs().tz(JAKARTA_TZ);

  return (
    <div>
      <PageHeader
        title={`Hello, ${me.name}`}
        description={`${now.format("dddd, DD MMM YYYY")} · ${me.role.charAt(0).toUpperCase()}${me.role.slice(1)}`}
      />
      <div className="grid gap-8">
        {navGroupsForRole(me.role).map((group) => (
          <section key={group.label} className="grid gap-3">
            <h2 className="text-headline font-medium text-foreground">
              {group.label}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.items.map((item) => (
                <li key={item.to}>
                  <Card className="h-full py-0 transition-colors hover:bg-primary/[0.04]">
                    <Link
                      to={item.to}
                      preload="viewport"
                      className="flex h-full flex-col gap-2 p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-2 text-body font-medium">
                        <HugeiconsIcon className="size-5" icon={item.icon} />
                        {item.label}
                      </span>
                      <span className="text-subhead text-foreground/80">
                        {item.description}
                      </span>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_admin/")({
  component: HomePage,
});
