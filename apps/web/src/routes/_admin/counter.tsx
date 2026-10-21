import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CounterPage } from "@/features/counter/components/counter-page";
import { storesQueries } from "@/features/stores/api";

const counterSearchSchema = z.object({
	storeId: z.coerce.number().int().positive().optional().catch(undefined),
	// The shelf Order open in the sheet, on a tablet or desktop.
	open: z.coerce.number().int().positive().optional().catch(undefined),
	tab: z.enum(["status", "summary"]).catch("status"),
	// The Summary's day; today when absent.
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.refine((date) =>
			new Date(`${date}T00:00:00Z`).toISOString().startsWith(date),
		)
		.optional()
		.catch(undefined),
	// The Summary list open in the sheet, so a phone's back from an Order
	// lands on it again.
	list: z.string().optional().catch(undefined),
});

const CounterRoute = () => {
	const { storeId, tab, date } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	return (
		<CounterPage
			date={date}
			onDateChange={(next) =>
				navigate({ search: (prev) => ({ ...prev, date: next }), replace: true })
			}
			onStoreChange={(next) =>
				navigate({
					// An Order open from the old Store's shelf must not follow the switch.
					search: (prev) => ({ ...prev, storeId: next, open: undefined }),
					replace: true,
				})
			}
			onTabChange={(next) =>
				navigate({ search: (prev) => ({ ...prev, tab: next }) })
			}
			storeId={storeId}
			tab={tab}
		/>
	);
};

export const Route = createFileRoute("/_admin/counter")({
	validateSearch: (search) => counterSearchSchema.parse(search),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(storesQueries.list()),
	component: CounterRoute,
	// Past a second, the page itself draws with skeleton sections.
	pendingComponent: CounterRoute,
	codeSplitGroupings: [["component", "pendingComponent"]],
});
