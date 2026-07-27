import { db } from "@/db";

// The single admin surface allowed to return pickup_code (ADR-0016: the
// printed receipt is the claim ticket). Keep this query separate from
// getOrderDetailById, which deliberately strips the code (ADR-0005).
export async function getOrderReceiptById(id: number) {
  const receipt = await db.query.ordersTable.findFirst({
    where: { id },
    columns: {
      id: true,
      code: true,
      created_at: true,
      notes: true,
      payment_status: true,
      total: true,
      discount: true,
      discount_source: true,
      pickup_code: true,
    },
    with: {
      store: {
        columns: {
          name: true,
          address: true,
          phone_number: true,
        },
      },
      customer: {
        columns: {
          name: true,
          phone_number: true,
        },
      },
      createdBy: {
        columns: {
          name: true,
        },
      },
      paymentMethod: {
        columns: {
          name: true,
        },
      },
      campaigns: {
        columns: {
          id: true,
          applied_amount: true,
        },
        with: {
          campaign: {
            columns: {
              code: true,
              name: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
      services: {
        columns: {
          id: true,
          item_code: true,
          subtotal: true,
          brand: true,
          color: true,
          model: true,
          size: true,
          notes: true,
        },
        with: {
          service: {
            columns: {
              name: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
      products: {
        columns: {
          id: true,
          qty: true,
          price: true,
          subtotal: true,
        },
        with: {
          product: {
            columns: {
              name: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  return receipt ?? null;
}
