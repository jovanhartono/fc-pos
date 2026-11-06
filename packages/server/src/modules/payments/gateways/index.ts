import { dokuGateway } from "./doku";
import { midtransGateway } from "./midtrans";
import { isMockGatewayEnabled, withMockGateway } from "./mock";
import {
  PAYMENT_GATEWAYS,
  type PaymentGateway,
  type PaymentGatewayName,
} from "./types";

const GATEWAYS: Record<PaymentGatewayName, PaymentGateway> = {
  doku: dokuGateway,
  midtrans: midtransGateway,
};

export function getPaymentGateway(name: PaymentGatewayName): PaymentGateway {
  return isMockGatewayEnabled()
    ? withMockGateway(GATEWAYS[name])
    : GATEWAYS[name];
}

// Unset or misspelled turns online payment off rather than charging through
// a gateway nobody meant to pick.
export function activePaymentGatewayName(): PaymentGatewayName | null {
  const name = process.env.PAYMENT_GATEWAY;
  return PAYMENT_GATEWAYS.find((gateway) => gateway === name) ?? null;
}
