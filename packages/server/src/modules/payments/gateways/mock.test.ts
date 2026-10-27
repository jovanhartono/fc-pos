import { beforeEach, describe, expect, it } from "bun:test";
import { dokuGateway } from "./doku";
import { midtransGateway } from "./midtrans";
import { buildMockNotification, isMockGatewayEnabled } from "./mock";

const verify = (gateway: typeof midtransGateway, tamper: boolean) => {
  const notification = buildMockNotification({
    amount: 275_000,
    gateway: gateway.name,
    outcome: "paid",
    reference: "FC-12-abcd1234",
    tamper,
  });
  return gateway.verifyNotification({
    headers: Object.fromEntries(
      Object.entries(notification.headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
    path: notification.path,
    rawBody: notification.body,
  });
};

describe("mock gateway notifications", () => {
  beforeEach(() => {
    process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-test";
    process.env.DOKU_CLIENT_ID = "BRN-0001";
    process.env.DOKU_SECRET_KEY = "SK-test";
  });

  it.each([midtransGateway, dokuGateway])(
    "passes the real $name signature check",
    async (gateway) => {
      const result = await verify(gateway, false);
      expect(result).toMatchObject({
        amount: 275_000,
        reference: "FC-12-abcd1234",
        status: "paid",
      });
    }
  );

  it.each([midtransGateway, dokuGateway])(
    "is refused by $name when tampered",
    async (gateway) => {
      expect(await verify(gateway, true)).toBeNull();
    }
  );

  it("never turns on in production", () => {
    process.env.PAYMENT_GATEWAY_MOCK = "true";
    process.env.VERCEL_ENV = "production";
    expect(isMockGatewayEnabled()).toBe(false);
    process.env.VERCEL_ENV = "preview";
    expect(isMockGatewayEnabled()).toBe(true);
    delete process.env.PAYMENT_GATEWAY_MOCK;
    delete process.env.VERCEL_ENV;
  });
});
