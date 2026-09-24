import { type DbExecutor, db } from "@/db";
import { BadRequestException } from "@/http-exceptions";
import type { OrderServiceStatus } from "@/modules/orders/order-status-machine";

// The tag and descriptors staff and customers read off the physical object
// (ADR-0017) — the same handful of fields wherever an Item is named.
export const itemCardColumns = {
  id: true,
  item_code: true,
  brand: true,
  color: true,
  model: true,
  size: true,
} as const;

// Who did it: the name a screen prints beside an event, never the login.
export const userRefColumns = { id: true, name: true } as const;

// An Order named from somewhere else: enough to label it and to check the
// staff member works at the store that took it in.
export const orderRefColumns = {
  id: true,
  code: true,
  store_id: true,
  status: true,
  payment_status: true,
} as const;

// What the money and status desks read before they write. Never pickup_code:
// only the printed Receipt carries it (ADR-0016).
const orderStateColumns = {
  ...orderRefColumns,
  total: true,
  discount: true,
  discount_source: true,
  paid_amount: true,
  refunded_amount: true,
} as const;

// Both ends of a Complaint (ADR-0013), one shape for the order sheet and queue
// detail so the same line reads the same on both.
const lineComplaintRelations = {
  complaints: {
    columns: { id: true, created_at: true, reason: true },
    limit: 1,
    orderBy: { id: "asc" },
    with: {
      openedBy: { columns: userRefColumns },
      reworkLines: {
        columns: { id: true, status: true },
        orderBy: { id: "asc" },
        with: {
          // When the round went on the rack; reworks from before ADR-0013's
          // 2026-09-24 amendment have none.
          statusLogs: {
            columns: { created_at: true },
            where: { from_status: { isNull: true } },
            limit: 1,
            with: { changedBy: { columns: userRefColumns } },
          },
        },
      },
    },
  },
  reworkOf: {
    columns: { id: true, created_at: true, reason: true },
    with: {
      openedBy: { columns: userRefColumns },
      orderService: {
        columns: { id: true },
        with: {
          service: { columns: { id: true, name: true } },
          handler: { columns: userRefColumns },
          pickupEvent: { columns: { picked_up_at: true } },
        },
      },
      reworkLines: { columns: { id: true }, orderBy: { id: "asc" }, limit: 1 },
    },
  },
} as const;

export interface UserRef {
  id: number;
  name: string;
}

interface OpeningLog {
  changedBy: UserRef | null;
  created_at: Date;
}

interface ComplaintOpening {
  created_at: Date;
  openedBy: UserRef | null;
}

export interface ReworkOpening {
  rework_opened_at: Date | null;
  rework_opened_by: UserRef | null;
}

interface LineWithComplaints {
  complaints: ReadonlyArray<
    ComplaintOpening & {
      id: number;
      reason: string;
      reworkLines: ReadonlyArray<{
        id: number;
        status: OrderServiceStatus;
        statusLogs: readonly OpeningLog[];
      }>;
    }
  >;
  id: number;
  reworkOf:
    | (ComplaintOpening & { reworkLines: ReadonlyArray<{ id: number }> })
    | null;
  statusLogs: ReadonlyArray<OpeningLog & { from_status: string | null }>;
}

// Rounds from before the rack entry was logged: the first dates from its
// Complaint, a later one stays blank rather than guess.
function reworkOpening(
  log: OpeningLog | undefined,
  complaint: ComplaintOpening,
  isFirstRound: boolean
): ReworkOpening {
  if (log) {
    return {
      rework_opened_at: log.created_at,
      rework_opened_by: log.changedBy,
    };
  }
  if (isFirstRound) {
    return {
      rework_opened_at: complaint.created_at,
      rework_opened_by: complaint.openedBy,
    };
  }
  return { rework_opened_at: null, rework_opened_by: null };
}

// When each Rework round went on the rack and who put it there, for the line
// itself and for every round of its Complaint.
export function withReworkOpenings(line: LineWithComplaints) {
  const { reworkOf } = line;
  const own: ReworkOpening = reworkOf
    ? reworkOpening(
        line.statusLogs.find((log) => log.from_status === null),
        reworkOf,
        reworkOf.reworkLines[0]?.id === line.id
      )
    : { rework_opened_at: null, rework_opened_by: null };

  return {
    ...own,
    complaints: line.complaints.map(({ reworkLines, ...complaint }) => ({
      ...complaint,
      reworkLines: reworkLines.map(({ statusLogs, ...round }, index) => ({
        ...round,
        ...reworkOpening(statusLogs[0], complaint, index === 0),
      })),
    })),
  };
}

export function findOrderState(executor: DbExecutor, id: number) {
  return executor.query.ordersTable.findFirst({
    where: { id },
    columns: orderStateColumns,
    with: {
      // The store code a promo is validated against at the payment desk.
      store: { columns: { code: true } },
    },
  });
}

export async function getOrderStateOrThrow(executor: DbExecutor, id: number) {
  const order = await findOrderState(executor, id);

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  return order;
}

export function findOrderDetail(id: number) {
  return db.query.ordersTable.findFirst({
    where: { id },
    with: {
      campaigns: {
        with: {
          campaign: true,
        },
        orderBy: { id: "asc" },
      },
      collectedBy: {
        columns: userRefColumns,
      },
      customer: true,
      paidBy: {
        columns: userRefColumns,
      },
      paymentMethod: true,
      pickupEvents: {
        with: {
          pickedUpBy: {
            columns: userRefColumns,
          },
        },
        orderBy: { picked_up_at: "asc" },
      },
      products: {
        with: {
          product: true,
        },
      },
      refunds: {
        with: {
          items: true,
          refundedBy: {
            columns: userRefColumns,
          },
        },
        orderBy: { id: "asc" },
      },
      // The Order's objects, each carrying the treatments applied to it
      // (ADR-0017). The counter and the workshop both work object-first, so
      // this is the shape the wire carries; anything that genuinely works
      // per-treatment flattens it back.
      items: {
        with: {
          // The object's before-service photos, shared by every treatment on
          // it (ADR-0019).
          images: {
            where: { deleted_at: { isNull: true } },
            orderBy: { id: "asc" },
          },
          services: {
            with: {
              handler: {
                columns: userRefColumns,
              },
              ...lineComplaintRelations,
              refundItems: true,
              // Name and list price only — enough for the payment sheet to
              // tell a no-list-price Repair from a priced Service; the shop's
              // cost base stays off the wire.
              service: { columns: { id: true, name: true, price: true } },
              statusLogs: {
                with: {
                  changedBy: {
                    columns: userRefColumns,
                  },
                },
                orderBy: { id: "asc" },
              },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { id: "asc" },
      },
      store: true,
    },
  });
}

// The single read allowed to hand pickup_code to an admin response (ADR-0016:
// the printed receipt is the claim ticket). Kept textually separate from
// findOrderDetail, whose service strips the code (ADR-0005).
export function findOrderReceipt(id: number) {
  return db.query.ordersTable.findFirst({
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
      // devices are not printed. The POS only offers these registered Bluetooth
      // names, so a receipt never comes out at another store.
      store: {
        columns: {
          name: true,
          address: true,
          phone_number: true,
        },
        with: {
          devices: { columns: { name: true } },
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
        columns: itemCardColumns,
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
}

// The queue's line-detail screen: one line plus enough of its Order to label
// it, never the whole Order (ADR-0016: no pickup_code here).
export function findOrderServiceDetail(orderId: number, serviceId: number) {
  return db.query.ordersServicesTable.findFirst({
    where: { id: serviceId, order_id: orderId },
    columns: {
      id: true,
      status: true,
      is_priority: true,
      handler_id: true,
    },
    with: {
      order: {
        columns: { id: true, code: true, created_at: true },
        with: {
          store: { columns: { id: true, code: true } },
          customer: { columns: { id: true, name: true, phone_number: true } },
        },
      },
      handler: { columns: userRefColumns },
      service: { columns: { id: true, name: true } },
      ...lineComplaintRelations,
      statusLogs: {
        with: { changedBy: { columns: userRefColumns } },
        orderBy: { id: "asc" },
      },
      item: {
        columns: itemCardColumns,
        with: {
          images: {
            where: { deleted_at: { isNull: true } },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });
}

export function findOrderForLookup(id: number) {
  return db.query.ordersTable.findFirst({
    where: { id },
    columns: { id: true, store_id: true },
  });
}

// The customer's own view of their Order. pickup_code rides along so the
// tracker can reveal it once something is collectable — when, is the tracking
// service's call, never this read's. No staff notes, the Order's or a status
// change's: anyone holding the code and the phone number can read this.
export function findTrackedOrder(code: string, customerId: number) {
  return db.query.ordersTable.findFirst({
    where: {
      code,
      customer_id: customerId,
    },
    columns: {
      id: true,
      code: true,
      status: true,
      payment_status: true,
      discount: true,
      total: true,
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
        columns: itemCardColumns,
        with: {
          services: {
            columns: {
              id: true,
              // Read only to tell a pair that was refunded and collected
              // from one that was refunded and is still on our rack. It is
              // an internal id and is stripped again in the service.
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
}
