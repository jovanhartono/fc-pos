import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Shift } from "@/lib/api";
import { shiftsQueryOptions, storesQueryOptions } from "@/lib/query-options";

const shiftsSearchSchema = z.object({
	from: z.string().optional().catch(undefined),
	store_id: z.coerce.number().int().positive().optional().catch(undefined),
	to: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_admin/shifts")({
	validateSearch: (search) => shiftsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(shiftsQueryOptions(deps)),
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
	const shiftsQuery = useQuery(shiftsQueryOptions(search));
	const storesQuery = useQuery(storesQueryOptions());
	const shifts = shiftsQuery.data ?? [];
	const stores = storesQuery.data ?? [];

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
					<CardContent className="pt-6">
						<div className="mb-4 flex flex-wrap items-end gap-2">
							<div className="grid gap-1">
								<label
									htmlFor="shifts-store"
									className="text-muted-foreground text-xs font-medium uppercase"
								>
									Store
								</label>
								<Select
									value={
										search.store_id !== undefined
											? String(search.store_id)
											: "all"
									}
									onValueChange={(value) => {
										void navigate({
											search: (prev) => ({
												...prev,
												store_id:
													!value || value === "all" ? undefined : Number(value),
											}),
										});
									}}
								>
									<SelectTrigger
										id="shifts-store"
										size="md"
										className="min-w-40"
									>
										<SelectValue placeholder="All stores" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All stores</SelectItem>
										{stores.map((store) => (
											<SelectItem key={store.id} value={String(store.id)}>
												{store.code} · {store.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-1">
								<span className="text-muted-foreground text-xs font-medium uppercase">
									Date range
								</span>
								<DateRangePicker
									id="shifts-range"
									from={search.from}
									to={search.to}
									onChange={({ from, to }) => {
										void navigate({
											search: (prev) => ({
												...prev,
												from: from ?? undefined,
												to: to ?? undefined,
											}),
										});
									}}
								/>
							</div>
						</div>
						<DataTable
							columns={columns}
							data={shifts}
							isLoading={shiftsQuery.isPending}
						/>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
