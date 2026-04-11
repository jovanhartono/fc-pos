import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { db } from "@/db";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const POSTPublicTrackOrderSchema = z.object({
  code: z.string().trim().min(1).max(32),
  phone_number: z.string().trim().min(6).max(20),
});

const nonDigitRegex = /\D/g;

function normalizePhoneNumber(value: string) {
  return value.replace(nonDigitRegex, "");
}

function maskPhoneNumber(phone: string) {
  const suffix = phone.slice(-4);
  return `******${suffix}`;
}

const app = new Hono().post(
  "/track",
  zodValidator("json", POSTPublicTrackOrderSchema),
  async (c) => {
    const { code, phone_number } = c.req.valid("json");
    const normalizedPhone = normalizePhoneNumber(phone_number);

    const order = await db.query.ordersTable.findFirst({
      where: {
        code,
        customer: {
          RAW: (customer) =>
            sql`REGEXP_REPLACE(${customer.phone_number}, '\D', '', 'g') = ${normalizedPhone}`,
        },
      },
      columns: {
        id: true,
        code: true,
        intake_photo_uploaded_at: true,
        intake_photo_url: true,
        status: true,
        payment_status: true,
        discount: true,
        total: true,
        notes: true,
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
        services: {
          columns: {
            brand: true,
            color: true,
            id: true,
            item_code: true,
            model: true,
            size: true,
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
      return c.json(
        failure("Order code or phone number is invalid"),
        StatusCodes.NOT_FOUND
      );
    }

    const customer = order.customer;

    return c.json(
      success(
        {
          ...order,
          services: order.services,
          customer: {
            id: customer.id,
            name: customer.name,
            phone_number_masked: maskPhoneNumber(customer.phone_number),
          },
        },
        "Order status retrieved successfully"
      )
    );
  }
);

export default app;
