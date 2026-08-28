import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { NotFoundException } from "@/http-exceptions";
import { deriveItemStatus } from "@/modules/orders/order-status-machine";
import { phoneSchema } from "@/schema/common";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const POSTPublicTrackOrderSchema = z.object({
  code: z.string().trim().min(1).max(32),
  phone_number: phoneSchema,
});

function maskPhoneNumber(phone: string) {
  const suffix = phone.slice(-4);
  return `******${suffix}`;
}

const app = new Hono().post(
  "/track",
  zodValidator("json", POSTPublicTrackOrderSchema),
  async (c) => {
    const { code, phone_number } = c.req.valid("json");

    const customer = await db.query.customersTable.findFirst({
      where: { phone_number },
      columns: { id: true },
    });

    if (!customer) {
      throw new NotFoundException("Order code or phone number is invalid");
    }

    const order = await db.query.ordersTable.findFirst({
      where: {
        code,
        customer_id: customer.id,
      },
      columns: {
        id: true,
        code: true,
        status: true,
        payment_status: true,
        discount: true,
        total: true,
        notes: true,
        pickup_code: true,
        created_at: true,
        completed_at: true,
        cancelled_at: true,
        updated_at: true,
      },
      with: {
        customer: {
          columns: {
            id: true,
            name: true,
            phone_number: true,
          },
        },
        // Grouped by the object the customer handed over (ADR-0017), so the
        // tracking page reads "your shoe: clean done, repaint in progress"
        // rather than listing the same shoe three times.
        items: {
          columns: {
            brand: true,
            color: true,
            id: true,
            item_code: true,
            model: true,
            size: true,
          },
          with: {
            services: {
              columns: {
                id: true,
                // Read only to tell a pair that was refunded and collected
                // from one that was refunded and is still on our rack. It is
                // an internal id and is stripped again below.
                pickup_event_id: true,
                status: true,
              },
              with: {
                service: {
                  columns: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
                statusLogs: {
                  columns: {
                    id: true,
                    from_status: true,
                    to_status: true,
                    note: true,
                    created_at: true,
                  },
                },
              },
              orderBy: { id: "asc" },
            },
          },
          orderBy: { id: "asc" },
        },
        store: {
          columns: {
            id: true,
            code: true,
            name: true,
            address: true,
            phone_number: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Order code or phone number is invalid");
    }

    const orderCustomer = order.customer;
    const { pickup_code, ...orderWithoutPickupCode } = order;

    return c.json(
      success(
        {
          ...orderWithoutPickupCode,
          // Derived here rather than on the page: the rollup now turns on
          // whether a pickup event ever took the object out, and that is a
          // shop-internal id no tracking page should be handed. Each treatment
          // is rebuilt field by field rather than spread-minus-the-id, so the
          // next column selected to feed a derivation has to be named here
          // before it can reach a customer.
          items: order.items.map(({ services, ...item }) => ({
            ...item,
            status: deriveItemStatus(services),
            services: services.map(({ id, status, service, statusLogs }) => ({
              id,
              status,
              service,
              statusLogs,
            })),
          })),
          pickup_code: order.status === "ready_for_pickup" ? pickup_code : null,
          customer: {
            id: orderCustomer.id,
            name: orderCustomer.name,
            phone_number_masked: maskPhoneNumber(orderCustomer.phone_number),
          },
        },
        "Order status retrieved successfully"
      )
    );
  }
);

export default app;
