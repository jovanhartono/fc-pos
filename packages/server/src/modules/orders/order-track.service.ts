import { NotFoundException } from "@/http-exceptions";
import {
  findTrackedOrder,
  findTrackedOrderRef,
} from "@/modules/orders/order-read.repository";
import { deriveItemStatus } from "@/modules/orders/order-status-machine";
import {
  createPaymentCharge,
  getTrackPaymentState,
  toTrackChargeView,
} from "@/modules/payments/payment-charge.service";
import { isCollectableItemStatus } from "@/schema/order-status";

// Anyone with the Order code and a phone number can open the page, so the
// number shown back must not work as a login on the next try.
function maskPhoneNumber(phone: string) {
  const suffix = phone.slice(-4);
  return `******${suffix}`;
}

interface TrackProof {
  code: string;
  phone_number: string;
}

// Code and phone are matched together, so a guesser never learns which half
// was right.
const INVALID_PROOF = "Order code or phone number is invalid";

export async function getTrackedOrder({ code, phone_number }: TrackProof) {
  let order = await findTrackedOrder(code, phone_number);

  if (!order) {
    throw new NotFoundException(INVALID_PROOF);
  }

  const payment = await getTrackPaymentState(order);
  // The check above may have just booked the Customer's QRIS; read the Order
  // again so this same poll shows it paid.
  if (payment.payment_status !== order.payment_status) {
    order = (await findTrackedOrder(code, phone_number)) ?? order;
  }

  const orderCustomer = order.customer;
  const { pickup_code, ...orderWithoutPickupCode } = order;

  // Item status is worked out here because it needs the shop-internal pickup
  // event id. Lines are rebuilt field by field so no new column reaches the
  // Customer without being named here.
  const items = order.items.map(({ services, ...item }) => ({
    ...item,
    status: deriveItemStatus(services),
    services: services.map(({ id, status, service, statusLogs }) => ({
      id,
      status,
      service,
      statusLogs,
    })),
  }));

  return {
    ...orderWithoutPickupCode,
    ...payment,
    items,
    // Shown while anything is left to collect, including a refunded pair the
    // Customer never came back for. The Order reads "completed" then (ADR-0008),
    // so checking the Order would hide the code for that forgotten pair.
    pickup_code: items.some((item) => isCollectableItemStatus(item.status))
      ? pickup_code
      : null,
    customer: {
      id: orderCustomer.id,
      name: orderCustomer.name,
      phone_number_masked: maskPhoneNumber(orderCustomer.phone_number),
    },
  };
}

// The Customer's Pay with QRIS button: the same proof as reading the page. The
// QR comes back to show on the page, or DOKU's QRIS page while its SNAP keys
// are missing.
export async function payTrackedOrder({ code, phone_number }: TrackProof) {
  const order = await findTrackedOrderRef(code, phone_number);

  if (!order) {
    throw new NotFoundException(INVALID_PROOF);
  }

  const charge = await createPaymentCharge({
    createdBy: null,
    orderId: order.id,
    request: null,
  });

  return toTrackChargeView(charge);
}
