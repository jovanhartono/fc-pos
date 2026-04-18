import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	dailyReportQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

interface DailyReportProps {
	date: string;
	storeId?: number;
	onDateChange: (date: string) => void;
	onStoreChange: (storeId: number | undefined) => void;
}

interface MetricCardProps {
	label: string;
	value: string;
	helper?: string;
}

const MetricCard = ({ label, value, helper }: MetricCardProps) => (
	<Card>
		<CardContent className="grid gap-1 pt-5">
			<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
				{label}
			</p>
			<p className="text-2xl font-semibold tabular-nums">{value}</p>
			{helper ? (
				<p className="text-muted-foreground text-xs">{helper}</p>
			) : null}
		</CardContent>
	</Card>
);

export const DailyReport = ({
	date,
	storeId,
	onDateChange,
	onStoreChange,
}: DailyReportProps) => {
	const reportQuery = useQuery(
		dailyReportQueryOptions({ date, store_id: storeId }),
	);
	const storesQuery = useQuery(storesQueryOptions());
	const stores = storesQuery.data ?? [];
	const report = reportQuery.data;

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<div className="grid gap-1">
					<label
						htmlFor="report-date"
						className="text-muted-foreground text-xs font-medium uppercase"
					>
						Date (Asia/Jakarta)
					</label>
					<Input
						id="report-date"
						type="date"
						value={date}
						max={dayjs().format("YYYY-MM-DD")}
						onChange={(event) => {
							if (event.target.value) {
								onDateChange(event.target.value);
							}
						}}
					/>
				</div>
				<div className="grid gap-1">
					<label
						htmlFor="report-store"
						className="text-muted-foreground text-xs font-medium uppercase"
					>
						Store
					</label>
					<Select
						value={storeId !== undefined ? String(storeId) : "all"}
						onValueChange={(value) =>
							onStoreChange(
								!value || value === "all" ? undefined : Number(value),
							)
						}
					>
						<SelectTrigger id="report-store" size="md" className="min-w-48">
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
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Revenue"
					value={formatIDRCurrency(String(report?.revenue ?? 0))}
					helper="Paid minus refunded"
				/>
				<MetricCard
					label="Items processed"
					value={String(report?.items_processed ?? 0)}
					helper="Moved to QC or ready"
				/>
				<MetricCard
					label="Orders in"
					value={String(report?.orders_in ?? 0)}
					helper="Created today"
				/>
				<MetricCard
					label="Orders out"
					value={String(report?.orders_out ?? 0)}
					helper="Picked up today"
				/>
			</div>
		</div>
	);
};
