import {
  categoriesTable,
  itemImagesTable,
  paymentMethodsTable,
  productsTable,
  servicesTable,
  storesTable,
  userStoresTable,
  usersTable,
} from "@/db/schema";
import { testDb } from "@/test-support/pglite";
import type { JWTPayload } from "@/types";

const toPayload = (user: {
  can_process_pickup: boolean;
  id: number;
  name: string;
  role: "admin" | "cashier" | "worker" | "courier";
  username: string;
}): JWTPayload => ({
  can_process_pickup: user.can_process_pickup,
  id: user.id,
  name: user.name,
  role: user.role,
  username: user.username,
});

// One shop open for business: a store with an admin and a cashier on its roster,
// one way to pay, and a catalog with a listed Service and a Product in stock.
export async function seedShop() {
  const [store] = await testDb
    .insert(storesTable)
    .values({
      address: "Jl. Kemang Raya 1",
      code: "KMG",
      is_active: true,
      latitude: "-6.26000000",
      longitude: "106.81000000",
      name: "Fresclean Kemang",
      phone_number: "+622112345678",
    })
    .returning();

  const [admin, cashier] = await testDb
    .insert(usersTable)
    .values([
      {
        name: "Ayu Admin",
        password: "hashed",
        role: "admin",
        username: "ayuadmin",
      },
      {
        name: "Cahya Cashier",
        password: "hashed",
        role: "cashier",
        username: "cahyacashier",
      },
    ])
    .returning();

  await testDb.insert(userStoresTable).values([
    { store_id: store.id, user_id: admin.id },
    { store_id: store.id, user_id: cashier.id },
  ]);

  const [paymentMethod] = await testDb
    .insert(paymentMethodsTable)
    .values({ code: "CASH", is_active: true, name: "Cash" })
    .returning();

  const [category] = await testDb
    .insert(categoriesTable)
    .values({ is_active: true, name: "Footwear" })
    .returning();

  const [service] = await testDb
    .insert(servicesTable)
    .values({
      category_id: category.id,
      code: "DCLN",
      cogs: "20000",
      is_active: true,
      name: "Deep Clean",
      price: "100000",
    })
    .returning();

  const [product] = await testDb
    .insert(productsTable)
    .values({
      category_id: category.id,
      cogs: "10000",
      is_active: true,
      name: "Shoe Tree",
      price: "50000",
      sku: "SHOETREE-01",
      stock: 10,
    })
    .returning();

  return {
    admin: toPayload(admin),
    cashier: toPayload(cashier),
    paymentMethodId: paymentMethod.id,
    productId: product.id,
    serviceId: service.id,
    store,
  };
}

export type Shop = Awaited<ReturnType<typeof seedShop>>;

// The drop-off photo, filed straight onto the Item: the presign/upload round
// trip is S3's business, and the gates under test only read the row.
export async function addItemPhoto(itemId: number, uploadedBy: number) {
  const [photo] = await testDb
    .insert(itemImagesTable)
    .values({
      image_path: `dev/orders/items/${itemId}/${crypto.randomUUID()}.webp`,
      item_id: itemId,
      uploaded_by: uploadedBy,
    })
    .returning();

  return photo;
}
