import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import type {
	ProductCartDisplayLine,
	ProductCartLine,
	ServiceCartDisplayLine,
	ServiceCartLine,
	TransactionDraftValues,
} from "@/features/transactions/lib/transactions";
import {
	productsQueryOptions,
	servicesQueryOptions,
} from "@/lib/query-options";

export interface CartTotals {
	cartProductRows: ProductCartDisplayLine[];
	cartServiceRows: ServiceCartDisplayLine[];
	subtotal: number;
	cartCount: number;
}

export function useCartTotals(): CartTotals {
	const [
		productCart = [] as ProductCartLine[],
		serviceCart = [] as ServiceCartLine[],
	] = useWatch<TransactionDraftValues, ["productCart", "serviceCart"]>({
		name: ["productCart", "serviceCart"],
	});

	const productsQuery = useQuery(productsQueryOptions());
	const servicesQuery = useQuery(servicesQueryOptions());

	const productMap = useMemo(
		() =>
			new Map(
				(productsQuery.data ?? [])
					.filter((product) => product.is_active)
					.map((product) => [product.id, product]),
			),
		[productsQuery.data],
	);
	const serviceMap = useMemo(
		() =>
			new Map(
				(servicesQuery.data ?? [])
					.filter((service) => service.is_active)
					.map((service) => [service.id, service]),
			),
		[servicesQuery.data],
	);

	const cartProductRows = useMemo(
		() =>
			productCart
				.map((line) => ({ ...line, product: productMap.get(line.id) }))
				.filter(
					(line): line is ProductCartDisplayLine => line.product !== undefined,
				),
		[productCart, productMap],
	);
	const cartServiceRows = useMemo(
		() =>
			serviceCart
				.map((line) => ({ ...line, service: serviceMap.get(line.id) }))
				.filter(
					(line): line is ServiceCartDisplayLine => line.service !== undefined,
				),
		[serviceCart, serviceMap],
	);

	const subtotal = useMemo(
		() =>
			cartProductRows.reduce(
				(total, line) => total + Number(line.product.price) * line.qty,
				0,
			) +
			cartServiceRows.reduce(
				(total, line) => total + Number(line.service.price),
				0,
			),
		[cartProductRows, cartServiceRows],
	);

	const cartCount = useMemo(
		() =>
			productCart.reduce((sum, item) => sum + item.qty, 0) + serviceCart.length,
		[productCart, serviceCart],
	);

	return { cartProductRows, cartServiceRows, subtotal, cartCount };
}
