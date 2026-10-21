import { create } from "zustand";

interface OrderWalkStore {
	orders: { id: number }[];
}

// The list under the open Order sheet. The sheet is built once when it opens,
// so the Counter's refresh reaches its Next and Previous only through here.
export const useOrderWalkStore = create<OrderWalkStore>()(() => ({
	orders: [],
}));
