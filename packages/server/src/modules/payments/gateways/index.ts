import { dokuGateway } from "./doku";
import { midtransGateway } from "./midtrans";
import { isMockGatewayEnabled, withMockGateway } from "./mock";
import { PAYMENT_GATEWAYS } from "./types";
import type { PaymentGateway, PaymentGatewayName } from "./types";

const GATEWAYS: Record<PaymentGatewayName, PaymentGateway> = {
  doku: dokuGateway,
  midtrans: midtransGateway,
};

export const getPaymentGateway = (name: PaymentGatewayName): PaymentGateway =>
  isMockGatewayEnabled() ? withMockGateway(GATEWAYS[name]) : GATEWAYS[name];

// Unset or misspelled turns online payment off rather than charging through
// a gateway nobody meant to pick.
export const activePaymentGatewayName = (): PaymentGatewayName | null => {
  const name = process.env.PAYMENT_GATEWAY;
  return PAYMENT_GATEWAYS.find((gateway) => gateway === name) ?? null;
};
