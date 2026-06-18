import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-picker";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import type { Shift } from "@/lib/api";
import { shiftsQueryOptions, storesQueryOptions } from "@/lib/query-options";

const PAGE_SIZE = 25;

const shiftsSearchSchema = z.object({
	from: z.string().optional().catch(undefined),
	page: z.coerce.number().int().positive().catch(1),
	store_id: z.coerce.number().int().positive().optional().catch(undefined),
	to: z.string().optional().catch(undefined),
});

const buildShiftsQuery = (search: z.infer<typeof shiftsSearchSchema>) => ({
	limit: PAGE_SIZE,
	offset: (search.page - 1) * PAGE_SIZE,
	...(search.from ? { from: search.from } : {}),
	...(search.to ? { to: search.to } : {}),
	...(search.store_id !== undefined ? { store_id: search.store_id } : {}),
});

export const Route = createFileRoute("/_admin/shifts")({
	validateSearch: (search) => shiftsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				shiftsQueryOptions(buildShiftsQuery(deps)),
			),
			context.queryClient.ensureQueryData(storesQueryOptions()),
		]),
	component: ShiftsPage,
});

const formatDate = (value: Date | string) =>
	dayjs(value).format("DD MMM YYYY HH:mm");

const formatDuration = (
	clockIn: Date | string,
	clockOut: Date | string | null,
) => {
	if (!clockOut) {
		return "Open";
	}
	const ms = dayjs(clockOut).diff(dayjs(clockIn));
	const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours}h ${String(minutes).padStart(2, "0")}m`;
};

function ShiftsPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const shiftsQuery = useQuery(shiftsQueryOptions(buildShiftsQuery(search)));
	const shifts = shiftsQuery.data?.items ?? [];

	const columns = useMemo<ColumnDef<Shift>[]>(
		() => [
			{
				id: "user",
				header: "Worker",
				cell: ({ row }) => (
					<div className="flex flex-col">
						<span className="font-medium">
							{row.original.user?.name ?? `User #${row.original.user_id}`}
						</span>
						<span className="text-muted-foreground text-xs">
							{row.original.user?.role ?? ""}
						</span>
					</div>
				),
			},
			{
				id: "store",
				header: "Store",
				cell: ({ row }) => row.original.store?.code ?? "-",
			},
			{
				id: "clock_in",
				header: "Clock in",
				cell: ({ row }) => formatDate(row.original.clock_in_at),
			},
			{
				id: "clock_out",
				header: "Clock out",
				cell: ({ row }) =>
					row.original.clock_out_at
						? formatDate(row.original.clock_out_at)
						: "—",
			},
			{
				id: "duration",
				header: "Duration",
				cell: ({ row }) => {
					const open = !row.original.clock_out_at;
					return (
						<Badge variant={open ? "success" : "outline"}>
							{formatDuration(
								row.original.clock_in_at,
								row.original.clock_out_at,
							)}
						</Badge>
					);
				},
			},
		],
		[],
	);

	return (
		<>
			<PageHeader title="Shifts" />
			<div className="grid gap-4">
				<Card>
					<CardContent>
						<div className="mb-4 flex flex-wrap items-center gap-2">
							<StoreAutocomplete
								id="shifts-store"
								hideLabel
								value={search.store_id?.toString() ?? ""}
								onValueChange={(value) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page: 1,
											store_id: value ? Number(value) : undefined,
										}),
									});
								}}
								allOptionLabel="All stores"
								placeholder="Filter by store"
								triggerClassName="h-10 w-max min-w-48 text-sm"
							/>
							<DateRangePicker
								commitOnComplete
								id="shifts-range"
								from={search.from}
								to={search.to}
								onChange={({ from, to }) => {
									void navigate({
										search: (prev) => ({
											...prev,
											from: from ?? undefined,
											page: 1,
											to: to ?? undefined,
										}),
									});
								}}
							/>
						</div>
						<div className="grid gap-4">
							<DataTable
								columns={columns}
								data={shifts}
								isLoading={shiftsQuery.isPending}
							/>
							<TablePagination
								meta={shiftsQuery.data?.meta}
								isLoading={shiftsQuery.isPending}
								onPageChange={(page) => {
									void navigate({
										search: (prev) => ({ ...prev, page }),
									});
								}}
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
