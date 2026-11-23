import type { ItemNameFields } from "@fresclean/api/types";

interface ServiceItemDetails {
  brand?: string | null;
  color?: string | null;
  model?: string | null;
  size?: string | null;
}

// One field order for every surface that names an Item — the cart line, the
// checkout row, the queue row. Two screens listing the same Item as
// "Nike · Black · Yeezy" and "Nike · Yeezy · Black" read as two different Items.
export const getOrderServiceItemDescriptors = ({
  brand,
  model,
  color,
  size,
}: ServiceItemDetails): string[] =>
  [brand, model, color, size].flatMap((value) => {
    const trimmed = value?.trim();
    return trimmed ? [trimmed] : [];
  });

export const getOrderServiceItemDetails = (
  details: ServiceItemDetails
): string | null => getOrderServiceItemDescriptors(details).join(" · ") || null;

export const getRowItemDetails = (row: Omit<ItemNameFields, "item_code">) =>
  getOrderServiceItemDetails({
    brand: row.item_brand,
    model: row.item_model,
    color: row.item_color,
    size: row.item_size,
  });

// List rows name the Item, not its tag; an Item taken in with no details has
// only the tag to go by.
export const getItemName = (row: ItemNameFields) =>
  getRowItemDetails(row) ?? row.item_code;

interface ShortItemTagFields {
  order_code: string;
  item_code: string;
}

// The Item code without its "<order code>-" prefix, for rows that already
// show the Order code.
export const getShortItemTag = ({
  order_code,
  item_code,
}: ShortItemTagFields): string => {
  const orderPrefix = `${order_code}-`;
  return item_code.startsWith(orderPrefix)
    ? item_code.slice(orderPrefix.length)
    : item_code;
};

export const formatOrderServiceItemDetails = (details: ServiceItemDetails) =>
  getOrderServiceItemDetails(details) ?? "No item details";
