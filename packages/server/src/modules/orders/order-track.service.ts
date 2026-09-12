import { NotFoundException } from "@/http-exceptions";
import { findCustomerIdByPhone } from "@/modules/customers/customer.repository";
import { findTrackedOrder } from "@/modules/orders/order-read.repository";
import {
  deriveItemStatus,
  isCollectableItemStatus,
} from "@/modules/orders/order-status-machine";

// The page is open to anyone with the Order code and a phone number, so the
// number it echoes back has to be unusable as a credential on the next try.
function maskPhoneNumber(phone: string) {
  const suffix = phone.slice(-4);
  return `******${suffix}`;
}

export async function getTrackedOrder({
  code,
  phone_number,
}: {
  code: string;
  phone_number: string;
}) {
  // One message for an unknown phone and for a code that is not this
  // customer's, so guessing one tells nothing about the other.
  const customer = await findCustomerIdByPhone(phone_number);

  if (!customer) {
    throw new NotFoundException("Order code or phone number is invalid");
  }

  const order = await findTrackedOrder(code, customer.id);

  if (!order) {
    throw new NotFoundException("Order code or phone number is invalid");
  }

  const orderCustomer = order.customer;
  const { pickup_code, ...orderWithoutPickupCode } = order;

  // Derived here rather than on the page: the rollup now turns on
  // whether a pickup event ever took the object out, and that is a
  // shop-internal id no tracking page should be handed. Each treatment
  // is rebuilt field by field rather than spread-minus-the-id, so the
  // next column selected to feed a derivation has to be named here
  // before it can reach a customer.
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
    items,
    // Shown while anything is still on the rack to collect — which
    // includes a fully refunded pair the customer never came back for.
    // The Order rollup says "completed" there (the money is settled,
    // ADR-0008), so gating on it hid the code for exactly the object
    // most likely to be forgotten.
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
