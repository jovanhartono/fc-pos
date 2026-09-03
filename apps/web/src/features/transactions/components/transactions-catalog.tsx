import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { CHIP_STRIP_ROW, ChipStripScroller } from "@/components/chip-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { useCartOps } from "@/features/transactions/cart/useCart";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import {
	categoriesQueryOptions,
	productsQueryOptions,
	servicesQueryOptions,
} from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

export function TransactionsCatalog() {
	const { isAdmin, visibleStores, handleStoreChange } =
		useTransactionsPageContext();
	const { addProduct, addService } = useCartOps();
	const searchTerm = useTransactionsPageStore((state) => state.searchTerm);
	const setSearchTerm = useTransactionsPageStore(
		(state) => state.setSearchTerm,
	);
	const activeCategory = useTransactionsPageStore(
		(state) => state.activeCategory,
	);
	const setActiveCategory = useTransactionsPageStore(
		(state) => state.setActiveCategory,
	);

	const categoriesQuery = useQuery(categoriesQueryOptions());
	const productsQuery = useQuery(productsQueryOptions());
	const servicesQuery = useQuery(servicesQueryOptions());

	const categories = categoriesQuery.data ?? [];
	const products = useMemo(
		() => (productsQuery.data ?? []).filter((product) => product.is_active),
		[productsQuery.data],
	);
	const services = useMemo(
		() => (servicesQuery.data ?? []).filter((service) => service.is_active),
		[servicesQuery.data],
	);

	const { control, formState } = useFormContext<TransactionDraftValues>();
	const selectedStoreId = useWatch({ control, name: "selectedStoreId" }) ?? "";
	const storeError = formState.errors.selectedStoreId;
	const productCart = useWatch({ control, name: "productCart" }) ?? [];

	const categoryMap = useMemo(
		() => new Map(categories.map((category) => [category.id, category])),
		[categories],
	);

	const deferredSearchTerm = useDeferredValue(searchTerm);
	const searchValue = deferredSearchTerm.trim().toLowerCase();

	const searchInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			const target = event.target as HTMLElement | null;
			const isTyping =
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable;
			if (isTyping) {
				return;
			}
			event.preventDefault();
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		};
		window.addEventListener("keydown", handleKeydown);
		return () => window.removeEventListener("keydown", handleKeydown);
	}, []);

	// One catalog: services and retail products in the same grid, with the
	// products' single "Retail Product" category as just another pill. The
	// Services / Add-ons toggle this replaces made the pills mode-scoped and
	// made search silently skip whichever half was inactive.
	const catalogEntries = useMemo(
		() => [
			...services.map((item) => ({ kind: "service" as const, item })),
			...products.map((item) => ({ kind: "product" as const, item })),
		],
		[products, services],
	);

	const filteredEntries = useMemo(
		() =>
			catalogEntries.filter(({ item }) => {
				if (activeCategory !== "all" && item.category_id !== activeCategory) {
					return false;
				}
				if (searchValue.length === 0) {
					return true;
				}
				return (
					item.name.toLowerCase().includes(searchValue) ||
					(item.description ?? "").toLowerCase().includes(searchValue) ||
					getEntityCategoryName(item, categoryMap)
						.toLowerCase()
						.includes(searchValue)
				);
			}),
		[activeCategory, catalogEntries, categoryMap, searchValue],
	);

	// Counted off the whole catalog, never the search-narrowed list: a pill set
	// that shrinks as you type can drop the pill you are filtering by.
	const categoryOptions = useMemo(() => {
		const byId = new Map<number, { id: number; name: string; count: number }>();
		for (const { item } of catalogEntries) {
			const seen = byId.get(item.category_id);
			if (seen) {
				seen.count += 1;
				continue;
			}
			byId.set(item.category_id, {
				id: item.category_id,
				name: getEntityCategoryName(item, categoryMap),
				count: 1,
			});
		}
		return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
	}, [categoryMap, catalogEntries]);

	const productCartQtyById = useMemo(
		() => new Map(productCart.map((line) => [line.id, line.qty])),
		[productCart],
	);

	return (
		<div className="grid gap-5">
			<Card className="border-border/70">
				<CardContent className="grid gap-4 p-4 sm:p-5">
					<div className="grid gap-3">
						{/* hideLabel returns the bare Combobox, so the error has to be
						    rendered here — this is the only place the store can be fixed,
						    and the checkout sheet covers it. */}
						<Field data-invalid={!!storeError}>
							<StoreAutocomplete
								hideLabel
								required
								value={selectedStoreId}
								onValueChange={handleStoreChange}
								allowedStoreIds={visibleStores.map((store) => store.id)}
								disabled={!isAdmin}
								triggerClassName="h-10 pointer-coarse:h-11 w-full border-border/70 bg-background text-sm"
								placeholder="Select store"
							/>
							<FieldError errors={[storeError]} />
						</Field>

						<Field>
							<FieldLabel className="sr-only" htmlFor="transaction-search">
								Search
							</FieldLabel>
							<div className="relative">
								<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									ref={searchInputRef}
									id="transaction-search"
									value={searchTerm}
									onChange={(event) => setSearchTerm(event.target.value)}
									placeholder="Search services or products (press /)"
									className="border-border/70 bg-background pl-9 pr-10"
								/>
								<kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 items-center justify-center border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
									/
								</kbd>
							</div>
						</Field>

						{/* Hidden when the catalog has one category, because then the strip
						    only ever says "All". */}
						{categoryOptions.length > 1 ? (
							<ChipStripScroller>
								<fieldset className={cn(CHIP_STRIP_ROW, "border-0 p-0")}>
									<legend className="sr-only">Filter by category</legend>
									<Button
										aria-pressed={activeCategory === "all"}
										className="h-11 gap-1.5 px-3 text-sm"
										onClick={() => setActiveCategory("all")}
										type="button"
										variant={activeCategory === "all" ? "default" : "outline"}
									>
										All
										<span className="font-mono font-semibold tabular-nums">
											{catalogEntries.length}
										</span>
									</Button>
									{categoryOptions.map((category) => {
										const isActive = activeCategory === category.id;

										return (
											<Button
												aria-pressed={isActive}
												className="h-11 gap-1.5 px-3 text-sm"
												key={category.id}
												onClick={() => setActiveCategory(category.id)}
												type="button"
												variant={isActive ? "default" : "outline"}
											>
												{category.name}
												<span className="font-mono font-semibold tabular-nums">
													{category.count}
												</span>
											</Button>
										);
									})}
								</fieldset>
							</ChipStripScroller>
						) : null}
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
				{filteredEntries.map((entry) => {
					// Narrow on entry.kind, never destructure first: pulling kind and
					// item apart severs the discriminated union and forces casts.
					const { item } = entry;
					const isProduct = entry.kind === "product";
					const productCount = productCartQtyById.get(item.id) ?? 0;
					const isOutOfStock =
						entry.kind === "product" &&
						Number(entry.item.stock ?? 0) <= productCount;
					const categoryName = getEntityCategoryName(item, categoryMap);

					return (
						<Card
							key={`${entry.kind}-${item.id}`}
							className={cn(
								"overflow-hidden border-border/70 transition-colors",
								isProduct
									? "bg-background hover:border-border"
									: "bg-muted/20 hover:border-border",
							)}
						>
							<CardContent className="p-0">
								<button
									type="button"
									className={cn(
										"flex h-full min-h-22 w-full flex-col gap-2 p-3 text-left outline-none transition active:scale-[0.97] focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
										isProduct
											? "hover:bg-muted/30 active:bg-muted/60"
											: "hover:bg-background/80 active:bg-background/60",
										isOutOfStock && "cursor-not-allowed opacity-50",
									)}
									onClick={() =>
										entry.kind === "product"
											? addProduct(entry.item)
											: addService(entry.item)
									}
									disabled={isOutOfStock}
									aria-label={`Add ${item.name}`}
								>
									{categoryName ? (
										<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
											{categoryName}
										</span>
									) : null}
									<p className="line-clamp-2 text-sm font-semibold leading-snug">
										{item.name}
									</p>
									<p className="mt-auto font-mono text-sm font-semibold tabular-nums">
										{/* No list price (ADR-0018): the cashier keys the number
										    on the cart line if agreed, or leaves it blank until
										    the workshop inspects the item. */}
										{item.price === null
											? "Priced per item"
											: formatIDRCurrency(String(item.price))}
									</p>
								</button>
							</CardContent>
						</Card>
					);
				})}
			</div>

			{filteredEntries.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center text-sm text-muted-foreground">
						No items.
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
