import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WorkerProductivityReport } from "@/features/reports/api";
import { numberFormatter } from "@/features/reports/utils/format";
import {
	buildCountIndex,
	groupByStore,
	workerKey,
} from "@/features/reports/utils/workers-report";
import { storesQueries } from "@/features/stores/api";
import { cn } from "@/lib/utils";

// Long Service names get the pinned first column, capped and wrapping on a
// phone so the number columns keep room and scroll sideways behind it.
const SERVICE_CLASS =
	"sticky left-0 z-10 min-w-34 max-w-34 bg-background px-3 py-2 text-left font-medium shadow-[inset_-1px_0_0_var(--color-border)] sm:max-w-none sm:min-w-44";
const CELL_CLASS = "min-w-18 whitespace-nowrap px-3 py-2 text-right align-top";
const HEAD_CLASS =
	"sticky top-0 z-10 bg-muted px-3 py-2 font-medium text-muted-foreground";
// The Total row stays in view while a long list of Services scrolls on desktop.
const TOTAL_CLASS =
	"sticky bottom-0 z-10 bg-background shadow-[inset_0_1px_0_var(--color-border)]";

interface MatrixColumn {
	key: string;
	header: ReactNode;
	count: (serviceId: number) => number;
	total: number;
}

interface StoreHeaderProps {
	code: string;
	name: string;
	onSelect: () => void;
}

// Picking a Store here is the same as picking it in the filter at the top.
const StoreHeader = ({ code, name, onSelect }: StoreHeaderProps) => (
	<button
		type="button"
		title={name}
		aria-label={name}
		onClick={onSelect}
		className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium hover:text-foreground"
	>
		{code}
		<CaretRightIcon aria-hidden="true" className="size-3 shrink-0" />
	</button>
);

interface ServicesByWorkerProps {
	data: WorkerProductivityReport;
	isAllStores: boolean;
	onStoreChange: (storeId: number) => void;
}

const useStoreCodes = () => {
	const { data: stores = [] } = useQuery(storesQueries.list());
	return new Map(stores.map((store) => [store.id, store.code]));
};

export const ServicesByWorker = ({
	data,
	isAllStores,
	onStoreChange,
}: ServicesByWorkerProps) => {
	const storeCodes = useStoreCodes();
	const { services, cells } = data.services_matrix;
	if (services.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No Services processed in range.
			</p>
		);
	}

	const { count, rowTotal } = buildCountIndex(cells);
	const groups = groupByStore(
		data.workers.filter((w) => rowTotal(w.user_id, w.store_id) > 0),
	);
	const columns: MatrixColumn[] = isAllStores
		? groups.map((group) => ({
				key: String(group.store_id),
				header: (
					<StoreHeader
						code={storeCodes.get(group.store_id) ?? group.store_name}
						name={group.store_name}
						onSelect={() => onStoreChange(group.store_id)}
					/>
				),
				count: (serviceId) =>
					group.rows.reduce(
						(sum, w) => sum + count(w.user_id, w.store_id, serviceId),
						0,
					),
				total: group.rows.reduce(
					(sum, w) => sum + rowTotal(w.user_id, w.store_id),
					0,
				),
			}))
		: groups
				.flatMap((group) => group.rows)
				.map((w) => ({
					key: workerKey(w.user_id, w.store_id),
					header: (
						<span title={w.user_name} className="line-clamp-3">
							{w.user_name}
						</span>
					),
					count: (serviceId) => count(w.user_id, w.store_id, serviceId),
					total: rowTotal(w.user_id, w.store_id),
				}));
	const grandTotal = services.reduce((sum, s) => sum + s.total, 0);
	const headClass = cn(HEAD_CLASS, "min-w-18 text-right align-bottom");

	return (
		<div className="overflow-x-auto border border-border lg:max-h-[26rem] lg:overflow-y-auto">
			<table className="w-full border-collapse text-xs tabular-nums">
				<thead>
					<tr className="border-border border-b">
						<th scope="col" className={cn(SERVICE_CLASS, HEAD_CLASS, "z-20")}>
							Service
						</th>
						{columns.map((column) => (
							<th key={column.key} scope="col" className={headClass}>
								{column.header}
							</th>
						))}
						<th scope="col" className={headClass}>
							Total
						</th>
					</tr>
				</thead>
				<tbody>
					{services.map((service) => (
						<tr key={service.service_id} className="border-border/70 border-b">
							<th scope="row" className={SERVICE_CLASS}>
								{service.service_name}
							</th>
							{columns.map((column) => {
								const value = column.count(service.service_id);
								return (
									<td key={column.key} className={CELL_CLASS}>
										{value === 0 ? (
											<span className="text-muted-foreground">–</span>
										) : (
											numberFormatter.format(value)
										)}
									</td>
								);
							})}
							<td className={cn(CELL_CLASS, "font-medium")}>
								{numberFormatter.format(service.total)}
							</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="font-semibold">
						<th scope="row" className={cn(SERVICE_CLASS, TOTAL_CLASS, "z-20")}>
							Total
						</th>
						{columns.map((column) => (
							<td key={column.key} className={cn(CELL_CLASS, TOTAL_CLASS)}>
								{numberFormatter.format(column.total)}
							</td>
						))}
						<td className={cn(CELL_CLASS, TOTAL_CLASS)}>
							{numberFormatter.format(grandTotal)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
};
