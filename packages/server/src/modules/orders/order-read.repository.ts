import { type DbExecutor, db } from "@/db";
import { BadRequestException } from "@/http-exceptions";
import type { OrderServiceStatus } from "@/modules/orders/order-status-machine";

// The Item code and descriptors, the same fields wherever an Item is named
// (ADR-0017).
export const itemCardColumns = {
  id: true,
  item_code: true,
  brand: true,
  color: true,
  model: true,
  size: true,
} as const;

// The name printed beside an event, never the login.
export const userRefColumns = { id: true, name: true } as const;

// Enough to label an Order and check the staff member works at its Store.
export const orderRefColumns = {
  id: true,
  code: true,
  store_id: true,
  status: true,
  payment_status: true,
} as const;

// Never pickup_code: only the printed Receipt carries it (ADR-0016).
const orderStateColumns = {
  ...orderRefColumns,
  total: true,
  discount: true,
  discount_source: true,
  paid_amount: true,
  refunded_amount: true,
} as const;

// Both ends of a Complaint (ADR-0013), one shape so a line reads the same on the
// Order sheet and the Queue detail.
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
          // When the round was queued; Reworks from before ADR-0013's
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

// The newest Pickup notice only: the Order counts as notified once any exists.
const latestPickupNoticeRelation = {
  pickupNotices: {
    columns: { sent_at: true },
    orderBy: { sent_at: "desc", id: "desc" },
    limit: 1,
    with: { sentBy: { columns: { name: true } } },
  },
} as const;

export function toLastPickupNotice(
  notices: ReadonlyArray<{ sent_at: Date; sentBy: { name: string } }>
) {
  const [latest] = notices;
  return latest
    ? { sent_at: latest.sent_at, sent_by_name: latest.sentBy.name }
    : null;
}

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

// Rounds from before queuing was logged: the first takes its Complaint's date, a
// later one stays blank rather than guess.
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
      // A promo is checked against the Store code at payment.
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
      ...latestPickupNoticeRelation,
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
      // Items with their lines nested (ADR-0017): the counter and the workshop
      // both work Item-first.
      items: {
        with: {
          // Item photos, shared by every line on the Item (ADR-0019).
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
              // No cost: the shop's costs stay off the screen. The list price
              // tells a Repair from a priced Service.
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

// The only staff read that returns pickup_code, since the printed Receipt is the
// Customer's proof (ADR-0016). Kept apart from findOrderDetail (ADR-0005).
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
      // devices are not printed: the POS offers only these printers, so a
      // Receipt never comes out at another Store.
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
      // The Receipt prints one header per Item with its lines beneath
      // (ADR-0017).
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

// The Queue's line detail: never the whole Order (ADR-0016: no pickup_code).
export function findOrderServiceDetail(orderId: number, serviceId: number) {
  return db.query.ordersServicesTable.findFirst({
    where: { id: serviceId, order_id: orderId },
    columns: {
      id: true,
      status: true,
      is_priority: true,
      handler_id: true,
      notes: true,
    },
    with: {
      order: {
        columns: {
          id: true,
          code: true,
          created_at: true,
          status: true,
        },
        with: {
          store: { columns: { id: true, code: true } },
          customer: { columns: { id: true, name: true, phone_number: true } },
          ...latestPickupNoticeRelation,
          // Every line on the Order, for the "2 of 3 ready" the notice waits on.
          services: {
            columns: { item_id: true, pickup_event_id: true, status: true },
          },
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

// The Customer's tracking page. The tracking service decides when to show
// pickup_code. No staff notes: anyone with the code and phone number can read this.
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
      // Grouped by Item (ADR-0017), so the page shows one shoe with its lines
      // rather than the same shoe three times.
      items: {
        columns: itemCardColumns,
        with: {
          services: {
            columns: {
              id: true,
              // Tells a refunded pair already collected from one still in the
              // shop; stripped again in the service.
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
