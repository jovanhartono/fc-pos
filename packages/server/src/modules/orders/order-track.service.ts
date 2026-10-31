import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { findCustomerIdByPhone } from "@/modules/customers/customer.repository";
import {
  findTrackedOrder,
  findTrackedOrderRef,
} from "@/modules/orders/order-read.repository";
import {
  deriveItemStatus,
  isCollectableItemStatus,
} from "@/modules/orders/order-status-machine";
import {
  createPaymentCharge,
  getTrackPaymentState,
} from "@/modules/payments/payment-charge.service";

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

// One message for both failures, so guessing one tells nothing about the other.
const INVALID_PROOF = "Order code or phone number is invalid";

export async function getTrackedOrder({ code, phone_number }: TrackProof) {
  const customer = await findCustomerIdByPhone(phone_number);

  if (!customer) {
    throw new NotFoundException(INVALID_PROOF);
  }

  const order = await findTrackedOrder(code, customer.id);

  if (!order) {
    throw new NotFoundException(INVALID_PROOF);
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
    ...(await getTrackPaymentState(order)),
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

// The Customer's Pay button: the same proof as reading the page, and the
// gateway's page comes back for the browser to open.
export async function payTrackedOrder({ code, phone_number }: TrackProof) {
  const customer = await findCustomerIdByPhone(phone_number);
  const order = customer
    ? await findTrackedOrderRef(code, customer.id)
    : undefined;

  if (!order) {
    throw new NotFoundException(INVALID_PROOF);
  }

  const charge = await createPaymentCharge({
    createdBy: null,
    kind: "checkout",
    orderId: order.id,
    request: null,
  });

  if (!charge.redirect_url) {
    throw new BadRequestException("Payment page is not available, try again");
  }

  return { redirect_url: charge.redirect_url };
}
