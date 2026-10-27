import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  GatewayChargeKind,
  GatewayChargeStatus,
  GatewayNotification,
  GatewayNotificationInput,
  GatewayStatusResult,
  PaymentGateway,
} from "./types";

const CHECKOUT_PATH = "/checkout/v1/payment";
const CANCEL_PATH = "/checkout/v3/cancellations";
const STATUS_PATH = "/orders/v1/status/";

// Methods a Personal (no legal entity) DOKU merchant may offer. BCA VA is
// refused for Personal merchants, so it is never listed.
const PAYMENT_METHODS: Record<GatewayChargeKind, string[]> = {
  qris: ["QRIS"],
  checkout: [
    "QRIS",
    "VIRTUAL_ACCOUNT_BRI",
    "VIRTUAL_ACCOUNT_BANK_MANDIRI",
    "VIRTUAL_ACCOUNT_BNI",
    "VIRTUAL_ACCOUNT_BANK_PERMATA",
    "EMONEY_SHOPEE_PAY",
    "EMONEY_OVO",
    "EMONEY_DANA",
  ],
};

const EXPIRED_DATE_REGEX = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const MILLIS_REGEX = /\.\d{3}Z$/;

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
};

const config = () => ({
  clientId: requireEnv("DOKU_CLIENT_ID"),
  secretKey: requireEnv("DOKU_SECRET_KEY"),
  baseUrl:
    process.env.DOKU_IS_PRODUCTION === "true"
      ? "https://api.doku.com"
      : "https://api-sandbox.doku.com",
});

const digestOf = (body: string) =>
  createHash("sha256").update(body).digest("base64");

export const signatureOf = (
  secretKey: string,
  parts: {
    clientId: string;
    requestId: string;
    timestamp: string;
    target: string;
    body?: string;
  }
) => {
  let component = `Client-Id:${parts.clientId}\nRequest-Id:${parts.requestId}\nRequest-Timestamp:${parts.timestamp}\nRequest-Target:${parts.target}`;
  if (parts.body !== undefined) {
    component += `\nDigest:${digestOf(parts.body)}`;
  }
  return `HMACSHA256=${createHmac("sha256", secretKey).update(component).digest("base64")}`;
};

const dokuFetch = (
  method: "GET" | "POST",
  target: string,
  payload?: unknown
) => {
  const { clientId, secretKey, baseUrl } = config();
  const requestId = randomUUID();
  const timestamp = new Date().toISOString().replace(MILLIS_REGEX, "Z");
  const body = payload === undefined ? undefined : JSON.stringify(payload);

  const response = fetch(`${baseUrl}${target}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Client-Id": clientId,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signatureOf(secretKey, {
        clientId,
        requestId,
        timestamp,
        target,
        body,
      }),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  return { requestId, response };
};

const failOn = async (response: Response, action: string) => {
  if (!response.ok) {
    throw new Error(
      `DOKU ${action} failed: ${response.status} ${await response.text()}`
    );
  }
};

// DOKU sends WIB wall time with no offset.
const parseExpiredDate = (value: unknown) => {
  const match = typeof value === "string" && EXPIRED_DATE_REGEX.exec(value);
  if (!match) {
    return null;
  }
  const [, y, mo, d, h, mi, s] = match;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+07:00`);
};

// FAILED is not final at DOKU: the customer can switch method on the same
// page and still pay, so it stays pending.
const mapStatus = (status: unknown): GatewayChargeStatus => {
  if (status === "SUCCESS") {
    return "paid";
  }
  if (status === "EXPIRED") {
    return "expired";
  }
  return "pending";
};

interface DokuResult {
  order?: { invoice_number?: unknown; amount?: unknown };
  transaction?: { status?: unknown };
}

const toResult = (payload: DokuResult): GatewayStatusResult => {
  const amount = Number(payload.order?.amount);
  return {
    status: mapStatus(payload.transaction?.status),
    amount:
      payload.order?.amount != null && Number.isFinite(amount) ? amount : null,
    raw: payload,
  };
};

const headerOf = (
  headers: Record<string, string | undefined>,
  name: string
) => {
  const wanted = name.toLowerCase();
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === wanted
  )?.[1];
};

const sameText = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const readNotification = (
  input: GatewayNotificationInput
): GatewayNotification | null => {
  try {
    const { clientId, secretKey } = config();
    const incomingClientId = headerOf(input.headers, "Client-Id");
    const requestId = headerOf(input.headers, "Request-Id");
    const timestamp = headerOf(input.headers, "Request-Timestamp");
    const signature = headerOf(input.headers, "Signature");
    if (
      !(incomingClientId && requestId && timestamp && signature) ||
      incomingClientId !== clientId
    ) {
      return null;
    }

    const expected = signatureOf(secretKey, {
      clientId: incomingClientId,
      requestId,
      timestamp,
      target: input.path,
      body: input.rawBody,
    });
    if (!sameText(expected, signature)) {
      return null;
    }

    const payload = JSON.parse(input.rawBody) as DokuResult;
    const reference = payload.order?.invoice_number;
    if (typeof reference !== "string" || reference === "") {
      return null;
    }
    return { ...toResult(payload), reference };
  } catch (error) {
    // A missing DOKU_SECRET_KEY lands here too, so every webhook 401s.
    console.error("DOKU notification rejected", error);
    return null;
  }
};

export const dokuGateway: PaymentGateway = {
  name: "doku",

  async createCharge(input) {
    const { requestId, response } = dokuFetch("POST", CHECKOUT_PATH, {
      order: {
        invoice_number: input.reference,
        amount: input.amount,
        callback_url: input.finishUrl,
      },
      payment: {
        payment_due_date: input.expiresInMinutes,
        payment_method_types: PAYMENT_METHODS[input.kind],
      },
      customer: {
        name: input.customer.name,
        ...(input.customer.phone ? { phone: input.customer.phone } : {}),
      },
      additional_info: {
        override_notification_url: input.notificationUrl,
      },
    });
    const res = await response;
    await failOn(res, "checkout");

    const json = (await res.json()) as {
      response?: { payment?: { url?: unknown; expired_date?: unknown } };
    };
    const url = json.response?.payment?.url;
    if (typeof url !== "string" || url === "") {
      throw new Error(`DOKU checkout returned no url: ${JSON.stringify(json)}`);
    }

    return {
      providerRef: requestId,
      qrImageUrl: null,
      redirectUrl: url,
      expiresAt:
        parseExpiredDate(json.response?.payment?.expired_date) ??
        new Date(Date.now() + input.expiresInMinutes * 60_000),
    };
  },

  async getStatus(ref) {
    const res = await dokuFetch(
      "GET",
      `${STATUS_PATH}${encodeURIComponent(ref.reference)}`
    ).response;
    // A checkout nobody has paid on yet has no transaction to report.
    if (res.status === 404) {
      return { status: "pending", amount: null, raw: await res.text() };
    }
    await failOn(res, "status");
    return toResult((await res.json()) as DokuResult);
  },

  async cancelCharge(ref) {
    if (!ref.providerRef) {
      return;
    }
    try {
      const res = await dokuFetch("POST", CANCEL_PATH, {
        order: { invoice_number: ref.reference },
        payment: { original_request_id: ref.providerRef },
        note: "cancelled by Fresclean",
      }).response;
      await failOn(res, "cancel");
    } catch (error) {
      // Cancel is off by default in the DOKU dashboard; the charge then
      // simply expires.
      console.warn("DOKU cancel skipped", ref.reference, error);
    }
  },

  verifyNotification(input) {
    return Promise.resolve(readNotification(input));
  },
};
