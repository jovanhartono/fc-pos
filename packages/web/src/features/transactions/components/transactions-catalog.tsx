import { MagnifyingGlass, Package, Scissors } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
	CatalogMode,
	CategoryFilter,
	CategoryTab,
} from "@/features/transactions/lib/transactions";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import type { Category, Product, Service, Store } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";

const listButtonClassName =
	"rounded-none border px-3 py-2 text-left text-xs transition-colors sm:text-sm";

type TransactionsCatalogProps = {
	mode: CatalogMode;
	searchTerm: string;
	isAdmin: boolean;
	visibleStores: Store[];
	selectedStoreId: string;
	products: Product[];
	services: Service[];
	productTabs: CategoryTab[];
	serviceTabs: CategoryTab[];
	activeProductCategory: CategoryFilter;
	activeServiceCategory: CategoryFilter;
	activeItems: Product[] | Service[];
	categoryMap: Map<number, Category>;
	productCartQtyById: Map<number, number>;
	serviceCartQtyById: Map<number, number>;
	onSearchTermChange: (value: string) => void;
	onStoreChange: (value: string) => void;
	onModeChange: (mode: CatalogMode) => void;
	onProductCategoryChange: (category: CategoryFilter) => void;
	onServiceCategoryChange: (category: CategoryFilter) => void;
	onAddProduct: (product: Product) => void;
	onAddService: (service: Service) => void;
};

export function TransactionsCatalog({
	mode,
	searchTerm,
	isAdmin,
	visibleStores,
	selectedStoreId,
	products,
	services,
	productTabs,
	serviceTabs,
	activeProductCategory,
	activeServiceCategory,
	activeItems,
	categoryMap,
	productCartQtyById,
	serviceCartQtyById,
	onSearchTermChange,
	onStoreChange,
	onModeChange,
	onProductCategoryChange,
	onServiceCategoryChange,
	onAddProduct,
	onAddService,
}: TransactionsCatalogProps) {
	const currentCategory =
		mode === "services" ? activeServiceCategory : activeProductCategory;
	const currentTabs = mode === "services" ? serviceTabs : productTabs;
	const currentLabel = mode === "services" ? "Services" : "Products";

	return (
		<div className="grid gap-5 self-start xl:sticky xl:top-24">
			<div className="grid gap-4">
				<Card className="border-border/70 bg-linear-to-br from-card via-card to-muted/20">
					<CardContent className="grid gap-4 p-4 sm:p-5">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
									Order Builder
								</p>
								<h2 className="mt-1 text-lg font-semibold">
									Pick a store and start building the order
								</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									Choose the store, search the catalog, and add services or
									products to the cart.
								</p>
							</div>
							<Badge variant="secondary">Starts in Services</Badge>
						</div>

						<div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_300px]">
							<Field>
								<FieldLabel htmlFor="transaction-search">
									Search Items
								</FieldLabel>
								<div className="relative">
									<MagnifyingGlass
										className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
										weight="duotone"
									/>
									<Input
										id="transaction-search"
										value={searchTerm}
										onChange={(event) => onSearchTermChange(event.target.value)}
										placeholder="Search services, products, or categories"
										className="h-11 border-border/70 bg-background/80 pl-9"
									/>
								</div>
							</Field>

							<Field>
								<FieldLabel htmlFor="transaction-store" asterisk>
									Store
								</FieldLabel>
								<Combobox
									id="transaction-store"
									required
									triggerClassName="h-11 w-full border-border/70 bg-background/80 text-sm"
									options={visibleStores.map((store) => ({
										value: String(store.id),
										label: `${store.code} - ${store.name}`,
									}))}
									value={selectedStoreId}
									onValueChange={onStoreChange}
									placeholder="Select store"
									searchPlaceholder="Search store..."
									emptyText="No store available"
									disabled={!isAdmin}
								/>
								<p className="text-xs text-muted-foreground">
									{isAdmin
										? "The selected store controls campaign availability and the final order context."
										: "Your assigned store is preselected and kept for your next visit."}
								</p>
							</Field>
						</div>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardContent className="grid gap-4 p-4 sm:p-5">
						<div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
							<div className="grid grid-cols-2 gap-2 rounded-none border border-border/70 bg-muted/20 p-2">
								<button
									type="button"
									className={cn(
										"grid gap-1 border px-3 py-3 text-left transition-colors",
										mode === "services"
											? "border-primary bg-primary text-primary-foreground"
											: "border-transparent bg-background hover:border-border/70 hover:bg-muted/40",
									)}
									onClick={() => onModeChange("services")}
								>
									<span className="flex items-center gap-2 text-sm font-medium">
										<Scissors className="size-4" weight="duotone" />
										Services
										<Badge
											variant={mode === "services" ? "secondary" : "outline"}
										>
											{services.length}
										</Badge>
									</span>
									<span className="text-xs text-current/75">
										Cleaning, restoration, and item handling
									</span>
								</button>
								<button
									type="button"
									className={cn(
										"grid gap-1 border px-3 py-3 text-left transition-colors",
										mode === "products"
											? "border-primary bg-primary text-primary-foreground"
											: "border-transparent bg-background hover:border-border/70 hover:bg-muted/40",
									)}
									onClick={() => onModeChange("products")}
								>
									<span className="flex items-center gap-2 text-sm font-medium">
										<Package className="size-4" weight="duotone" />
										Products
										<Badge
											variant={mode === "products" ? "secondary" : "outline"}
										>
											{products.length}
										</Badge>
									</span>
									<span className="text-xs text-current/75">
										Retail add-ons and supporting items
									</span>
								</button>
							</div>

							<div className="grid gap-2">
								<div className="flex items-center justify-between gap-3">
									<p className="text-sm font-medium">
										{currentLabel} Categories
									</p>
									<Badge variant="outline">
										{currentTabs.reduce((sum, tab) => sum + tab.count, 0)}{" "}
										listed
									</Badge>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										className={cn(
											listButtonClassName,
											currentCategory === "all"
												? "border-primary bg-primary text-primary-foreground"
												: "border-border bg-background hover:bg-muted",
										)}
										onClick={() => {
											if (mode === "products") {
												onProductCategoryChange("all");
												return;
											}

											onServiceCategoryChange("all");
										}}
									>
										{mode === "services" ? "All Services" : "All Products"}
									</button>
									{currentTabs.map((tab) => (
										<button
											key={`${mode}-${tab.id}`}
											type="button"
											className={cn(
												listButtonClassName,
												currentCategory === tab.id
													? "border-primary bg-primary text-primary-foreground"
													: "border-border bg-background hover:bg-muted",
											)}
											onClick={() => {
												if (mode === "products") {
													onProductCategoryChange(tab.id);
													return;
												}

												onServiceCategoryChange(tab.id);
											}}
										>
											<span className="flex items-center gap-2">
												{tab.label}
												<Badge
													variant={
														currentCategory === tab.id ? "secondary" : "outline"
													}
												>
													{tab.count}
												</Badge>
											</span>
										</button>
									))}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
				{activeItems.map((item) => {
					const isProduct = mode === "products";
					const itemCount = isProduct
						? (productCartQtyById.get(item.id) ?? 0)
						: (serviceCartQtyById.get(item.id) ?? 0);
					const isOutOfStock =
						isProduct && Number((item as Product).stock ?? 0) <= itemCount;

					return (
						<Card
							key={`${mode}-${item.id}`}
							className="overflow-hidden border-border/70 transition-colors hover:border-primary/60"
						>
							<CardContent className="p-0">
								<button
									type="button"
									className="grid h-full w-full gap-4 p-4 text-left"
									onClick={() =>
										isProduct
											? onAddProduct(item as Product)
											: onAddService(item as Service)
									}
									disabled={Boolean(isOutOfStock)}
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-sm font-semibold sm:text-base">
												{item.name}
											</p>
											<p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
												{getEntityCategoryName(item, categoryMap)}
											</p>
										</div>
										<Badge variant={isProduct ? "info" : "warning"}>
											{isProduct
												? `${Number((item as Product).stock ?? 0)} stock`
												: "Service"}
										</Badge>
									</div>

									<div className="mt-auto flex items-end justify-between gap-3">
										<p className="text-lg font-semibold">
											{formatIDRCurrency(String(item.price))}
										</p>
									</div>
								</button>
							</CardContent>
						</Card>
					);
				})}
			</div>

			{activeItems.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center text-sm text-muted-foreground">
						No catalog items match the current filters.
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
