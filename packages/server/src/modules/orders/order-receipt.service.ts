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
      status: true,
      payment_status: true,
      total: true,
      discount: true,
      discount_source: true,
      pickup_code: true,
    },
    with: {
      // id + printer_name are for the POS, not the paper: they let the web
      // app open the Bluetooth chooser on this store's own printer and, on the
      // first pair, remember which one that was.
      store: {
        columns: {
          id: true,
          name: true,
          address: true,
          phone_number: true,
          printer_name: true,
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
      // The struk prints one header per physical object — tag + descriptors
      // once — with each treatment sold against it as a sub-line beneath
      // (ADR-0017). One upsold pair is one header, three priced lines.
      items: {
        columns: {
          id: true,
          item_code: true,
          brand: true,
          color: true,
          model: true,
          size: true,
        },
        with: {
          services: {
            columns: {
              id: true,
              status: true,
              subtotal: true,
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
        },
        orderBy: { id: "asc" },
      },
      products: {
        columns: {
          id: true,
          qty: true,
          price: true,
          subtotal: true,
          cancelled_at: true,
          refunded_at: true,
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
