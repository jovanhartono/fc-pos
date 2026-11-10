import { useQuery } from "@tanstack/react-query";
import { categoriesQueries } from "@/features/categories/api";

export const useCategoryMap = () => {
	const categoriesQuery = useQuery(categoriesQueries.list());
	return new Map(
		(categoriesQuery.data ?? []).map((category) => [category.id, category]),
	);
};
