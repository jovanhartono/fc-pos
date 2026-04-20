import {
	MagnifyingGlassIcon,
	PackageIcon,
	ScissorsIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTransactionsCart } from "@/features/transactions/hooks/use-transactions-cart";
import {
	getEntityCategoryName,
	type TransactionDraftValues,
} from "@/features/transactions/lib/transactions";
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

export function TransactionsCatalog() {
	const { isAdmin, visibleStores, handleStoreChange } =
		useTransactionsPageContext();
	const { handleAddProduct, handleAddService } = useTransactionsCart();
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

	const { control } = useFormContext<TransactionDraftValues>();
	const selectedStoreId = useWatch({ control, name: "selectedStoreId" }) ?? "";
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

	const filteredProducts = useMemo(
		() =>
			products.filter((product) => {
				const categoryName = getEntityCategoryName(
					product,
					categoryMap,
				).toLowerCase();
				const matchesCategory =
					activeProductCategory === "all" ||
					product.category_id === activeProductCategory;
				const matchesSearch =
					searchValue.length === 0 ||
					product.name.toLowerCase().includes(searchValue) ||
					(product.description ?? "").toLowerCase().includes(searchValue) ||
					categoryName.includes(searchValue);

				return matchesCategory && matchesSearch;
			}),
		[activeProductCategory, categoryMap, products, searchValue],
	);
	const filteredServices = useMemo(
		() =>
			services.filter((service) => {
				const categoryName = getEntityCategoryName(
					service,
					categoryMap,
				).toLowerCase();
				const matchesCategory =
					activeServiceCategory === "all" ||
					service.category_id === activeServiceCategory;
				const matchesSearch =
					searchValue.length === 0 ||
					service.name.toLowerCase().includes(searchValue) ||
					(service.description ?? "").toLowerCase().includes(searchValue) ||
					categoryName.includes(searchValue);

				return matchesCategory && matchesSearch;
			}),
		[activeServiceCategory, categoryMap, searchValue, services],
	);

	const activeItems = mode === "products" ? filteredProducts : filteredServices;
	const productCartQtyById = useMemo(
		() => new Map(productCart.map((line) => [line.id, line.qty])),
		[productCart],
	);

	return (
		<div className="grid gap-5 self-start xl:sticky xl:top-0">
			<Card className="border-border/70 bg-linear-to-br from-background via-background to-card shadow-sm">
				<CardContent className="grid gap-4 p-4 sm:p-5">
					<div className="grid gap-3">
						<Field>
							<Combobox
								id="transaction-store"
								required
								triggerClassName="h-11 w-full border-border/70 bg-background text-sm"
								options={visibleStores.map((store) => ({
									value: String(store.id),
									label: `${store.code} - ${store.name}`,
								}))}
								value={selectedStoreId}
								onValueChange={handleStoreChange}
								placeholder="Select store"
								searchPlaceholder="Search store..."
								emptyText="No store available"
								disabled={!isAdmin}
							/>
						</Field>

						<div className="grid grid-cols-2 gap-2 border border-border/70 bg-background/80 p-1">
							<button
								type="button"
								className={cn(
									"flex items-center justify-between gap-2 border px-3 py-2 text-left transition-colors",
									mode === "services"
										? "border-foreground bg-foreground text-background"
										: "border-transparent text-foreground/70 hover:border-border/70 hover:bg-muted/40",
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
									"flex items-center justify-between gap-2 border px-3 py-2 text-left transition-colors",
									mode === "products"
										? "border-border bg-card text-foreground"
										: "border-transparent text-foreground/55 hover:border-border/70 hover:bg-muted/40",
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
									className="h-11 border-border/70 bg-background pl-9 pr-10"
								/>
								<kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 items-center justify-center border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
									/
								</kbd>
							</div>
						</Field>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
				{activeItems.map((item) => {
					const isProduct = mode === "products";
					const productCount = productCartQtyById.get(item.id) ?? 0;
					const isOutOfStock =
						isProduct && Number((item as Product).stock ?? 0) <= productCount;
					const categoryName = getEntityCategoryName(item, categoryMap);

					return (
						<Card
							key={`${mode}-${item.id}`}
							className={cn(
								"overflow-hidden border-border/70 shadow-sm transition-all",
								isProduct
									? "bg-background hover:border-border"
									: "bg-muted/20 hover:border-border hover:shadow-md",
							)}
						>
							<CardContent className="p-0">
								<button
									type="button"
									className={cn(
										"flex h-full w-full flex-col gap-2 p-3 text-left transition-colors",
										isProduct ? "hover:bg-muted/30" : "hover:bg-background/80",
										isOutOfStock && "cursor-not-allowed opacity-50",
									)}
									onClick={() =>
										isProduct
											? handleAddProduct(item as Product)
											: handleAddService(item as Service)
									}
									disabled={isOutOfStock}
									aria-label={`Add ${item.name}`}
								>
									{categoryName ? (
										<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
											{categoryName}
										</span>
									) : null}
									<p className="line-clamp-2 text-sm font-semibold leading-snug">
										{item.name}
									</p>
									<p className="mt-auto font-mono text-sm font-semibold tabular-nums">
										{formatIDRCurrency(String(item.price))}
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
