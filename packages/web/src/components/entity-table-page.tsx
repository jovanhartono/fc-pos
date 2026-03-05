import type { QueryKey } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, RowData } from "@tanstack/react-table";
import { AppShell } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EntityTablePageProps<TData extends RowData> {
	title: string;
	description?: string;
	queryKey: QueryKey;
	queryFn: () => Promise<TData[]>;
	columns: ColumnDef<TData, unknown>[];
}

export function EntityTablePage<TData extends RowData>({
	title,
	description,
	queryKey,
	queryFn,
	columns,
}: EntityTablePageProps<TData>) {
	const {
		data = [],
		isPending,
		isFetching,
	} = useQuery({
		queryKey,
		queryFn,
	});

	return (
		<AppShell title={title} description={description}>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle className="text-sm uppercase tracking-[0.12em] text-muted-foreground">
						Resource List
					</CardTitle>
					<Badge variant={isFetching ? "secondary" : "outline"}>
						{isFetching ? "Refreshing" : `${data.length} items`}
					</Badge>
				</CardHeader>
				<CardContent>
					<DataTable columns={columns} data={data} isLoading={isPending} />
				</CardContent>
			</Card>
		</AppShell>
	);
}
