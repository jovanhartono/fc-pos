import { NotFoundException } from "@/http-exceptions";
import { findCustomerIdByPhone } from "@/modules/customers/customer.repository";
import { findTrackedOrder } from "@/modules/orders/order-read.repository";
import {
  deriveItemStatus,
  isCollectableItemStatus,
} from "@/modules/orders/order-status-machine";

// Anyone with the Order code and a phone number can open the page, so the
// number shown back must not work as a login on the next try.
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
  // One message for both failures, so guessing one tells nothing about the other.
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
