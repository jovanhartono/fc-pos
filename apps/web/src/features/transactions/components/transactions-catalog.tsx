import {
	MagnifyingGlassIcon,
	PackageIcon,
	ScissorsIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { useCartOps } from "@/features/transactions/cart/useCart";
import { getEntityCategoryName } from "@/features/transactions/lib/transactions";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import type { Product, Service } from "@/lib/api";
import {
	categoriesQueryOptions,
	productsQueryOptions,
	servicesQueryOptions,
} from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

interface CategoryPillProps {
	label: string;
	isActive: boolean;
	onSelect: () => void;
	count?: number;
}

const CategoryPill = ({
	label,
	isActive,
	onSelect,
	count,
}: CategoryPillProps) => (
	<button
		aria-pressed={isActive}
		className={cn(
			"flex min-h-8 items-baseline gap-1.5 border px-2 py-1 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
			isActive
				? "border-foreground bg-foreground text-background"
				: "border-border/70 text-foreground/70 hover:bg-muted/40",
		)}
		onClick={onSelect}
		type="button"
	>
		{label}
		{count === undefined ? null : (
			<span className="font-mono font-semibold text-[10px] tabular-nums">
				{count}
			</span>
		)}
	</button>
);

export function TransactionsCatalog() {
	const { isAdmin, visibleStores, handleStoreChange } =
		useTransactionsPageContext();
	const { addProduct, addService } = useCartOps();
	const mode = useTransactionsPageStore((state) => state.mode);
	const setMode = useTransactionsPageStore((state) => state.setMode);
	const searchTerm = useTransactionsPageStore((state) => state.searchTerm);
	const setSearchTerm = useTransactionsPageStore(
		(state) => state.setSearchTerm,
	);
	const activeProductCategory = useTransactionsPageStore(
		(state) => state.activeProductCategory,
	);
	const activeServiceCategory = useTransactionsPageStore(
		(state) => state.activeServiceCategory,
	);
	const setActiveProductCategory = useTransactionsPageStore(
		(state) => state.setActiveProductCategory,
	);
	const setActiveServiceCategory = useTransactionsPageStore(
		(state) => state.setActiveServiceCategory,
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
	const serviceCart = useWatch({ control, name: "serviceCart" }) ?? [];

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

	const modeItems: (Product | Service)[] =
		mode === "products" ? products : services;
	const activeCategory =
		mode === "products" ? activeProductCategory : activeServiceCategory;
	const setActiveCategory =
		mode === "products" ? setActiveProductCategory : setActiveServiceCategory;

	// Counts come from the whole catalog, not the search-narrowed list: a pill set
	// that shrinks as you type can drop the pill you filtered by, leaving no way
	// back to All.
	const categoryOptions = useMemo(() => {
		const byId = new Map<number, { id: number; name: string; count: number }>();
		for (const item of modeItems) {
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
	}, [categoryMap, modeItems]);

	const activeItems = useMemo(
		() =>
			modeItems.filter((item) => {
				if (activeCategory !== "all" && item.category_id !== activeCategory) {
					return false;
				}
				if (searchValue.length === 0) {
					return true;
				}
				const categoryName = getEntityCategoryName(
					item,
					categoryMap,
				).toLowerCase();
				return (
					item.name.toLowerCase().includes(searchValue) ||
					(item.description ?? "").toLowerCase().includes(searchValue) ||
					categoryName.includes(searchValue)
				);
			}),
		[activeCategory, categoryMap, modeItems, searchValue],
	);

	const productCartQtyById = useMemo(
		() => new Map(productCart.map((line) => [line.id, line.qty])),
		[productCart],
	);

	// Each service add creates its own cart line (one line = one Item), so the
	// card's badge counts lines, not a qty field.
	const serviceCartCountById = useMemo(() => {
		const counts = new Map<number, number>();
		for (const line of serviceCart) {
			counts.set(line.id, (counts.get(line.id) ?? 0) + 1);
		}
		return counts;
	}, [serviceCart]);

	return (
		<div className="grid gap-5 self-start">
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

						<div className="grid grid-cols-2 gap-2 border border-border/70 bg-background/80 p-1">
							<button
								type="button"
								className={cn(
									"flex min-h-11 items-center justify-between gap-2 border px-3 py-2 text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
									mode === "services"
										? "border-foreground bg-foreground text-background active:bg-foreground/85"
										: "border-transparent text-foreground/70 hover:border-border/70 hover:bg-muted/40 active:border-border active:bg-muted/60",
								)}
								onClick={() => setMode("services")}
							>
								<span className="flex items-center gap-2 text-sm font-medium">
									<ScissorsIcon className="size-4" />
									Services
								</span>
							</button>
							<button
								type="button"
								className={cn(
									"flex min-h-11 items-center justify-between gap-2 border px-3 py-2 text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
									mode === "products"
										? "border-border bg-card text-foreground active:bg-card/85"
										: "border-transparent text-foreground/55 hover:border-border/70 hover:bg-muted/40 active:border-border active:bg-muted/60",
								)}
								onClick={() => setMode("products")}
							>
								<span className="flex items-center gap-2 text-sm font-medium">
									<PackageIcon className="size-4" />
									Add-ons
								</span>
							</button>
						</div>

						<Field>
							<FieldLabel htmlFor="transaction-search">Search</FieldLabel>
							<div className="relative">
								<MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									ref={searchInputRef}
									id="transaction-search"
									value={searchTerm}
									onChange={(event) => setSearchTerm(event.target.value)}
									placeholder="Search services or add-ons (press /)"
									className="border-border/70 bg-background pl-9 pr-10"
								/>
								<kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 items-center justify-center border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
									/
								</kbd>
							</div>
						</Field>

						{/* One strip instead of the same category eyebrow repeated on all 43
						    cards. A single category isn't a filter, so the strip only earns
						    its row when there are at least two. */}
						{categoryOptions.length > 1 ? (
							<fieldset className="flex min-w-0 flex-wrap gap-1 border-0 p-0">
								<legend className="sr-only">Filter by category</legend>
								<CategoryPill
									isActive={activeCategory === "all"}
									label="All"
									onSelect={() => setActiveCategory("all")}
								/>
								{categoryOptions.map((category) => (
									<CategoryPill
										count={category.count}
										isActive={activeCategory === category.id}
										key={category.id}
										label={category.name}
										onSelect={() => setActiveCategory(category.id)}
									/>
								))}
							</fieldset>
						) : null}
					</div>
				</CardContent>
			</Card>

			{/* Two-up from the smallest width: one card per row put 43 services over
			    6323px — about 7.5 phone screens to reach the last one. */}
			<div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
				{activeItems.map((item) => {
					const isProduct = mode === "products";
					const productCount = productCartQtyById.get(item.id) ?? 0;
					const isOutOfStock =
						isProduct && Number((item as Product).stock ?? 0) <= productCount;
					const inCartCount = isProduct
						? productCount
						: (serviceCartCountById.get(item.id) ?? 0);

					return (
						<Card
							key={`${mode}-${item.id}`}
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
										"relative flex h-full min-h-16 w-full flex-col gap-1 p-2.5 text-left outline-none transition active:scale-[0.97] focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
										isProduct
											? "hover:bg-muted/30 active:bg-muted/60"
											: "hover:bg-background/80 active:bg-background/60",
										isOutOfStock && "cursor-not-allowed opacity-50",
									)}
									onClick={() =>
										isProduct
											? addProduct(item as Product)
											: addService(item as Service)
									}
									disabled={isOutOfStock}
									aria-label={`Add ${item.name}`}
								>
									{/* Adding an item otherwise leaves no mark on the card it came
									    from, so a cashier mid-intake can't tell what they have
									    already put in the cart without opening it. */}
									{inCartCount > 0 ? (
										<span className="absolute top-0 right-0 grid size-5 place-items-center bg-foreground font-mono font-bold text-[10px] text-background tabular-nums">
											{inCartCount}
										</span>
									) : null}
									<p
										className={cn(
											"line-clamp-2 text-sm font-semibold leading-snug",
											inCartCount > 0 && "pr-5",
										)}
									>
										{item.name}
									</p>
									<p className="mt-auto font-mono text-xs font-semibold tabular-nums">
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

			{activeItems.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center text-sm text-muted-foreground">
						No items.
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
