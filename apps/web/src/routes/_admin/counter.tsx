import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CounterPage } from "@/features/counter/components/counter-page";
import { storesQueries } from "@/features/stores/api";

const counterSearchSchema = z.object({
	storeId: z.coerce.number().int().positive().optional().catch(undefined),
});

const CounterRoute = () => {
	const { storeId } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	return (
		<CounterPage
			onStoreChange={(next) =>
				navigate({ search: { storeId: next }, replace: true })
			}
			storeId={storeId}
		/>
	);
};

export const Route = createFileRoute("/_admin/counter")({
	validateSearch: (search) => counterSearchSchema.parse(search),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(storesQueries.list()),
	component: CounterRoute,
});
