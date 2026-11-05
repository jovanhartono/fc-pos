import {
  createHash,
  createHmac,
  randomInt,
  sign as rsaSign,
} from "node:crypto";
import { renderSVG } from "uqr";
import type {
  GatewayCharge,
  GatewayChargeInput,
  GatewayChargeRef,
  GatewayChargeStatus,
  GatewayStatusResult,
} from "./types";

// DOKU SNAP QRIS: DOKU hands back the QR itself, so the counter shows it in the
// dialog instead of opening DOKU's page in another tab.
const TOKEN_PATH = "/authorization/v1/access-token/b2b";
const GENERATE_PATH = "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate";
const QUERY_PATH = "/snap-adapter/b2b/v1.0/qr/qr-mpm-query";
const EXPIRE_PATH = "/snap-adapter/b2b/v1.0/qr/qr-expire";

const TIMEOUT_MS = 10_000;
const MINUTE_MS = 60_000;
const JAKARTA_OFFSET_MS = 7 * 60 * MINUTE_MS;
const ESCAPED_NEWLINE_REGEX = /\\n/g;

// Refunded and not-found change nothing here: a refund only follows a paid
// charge, and an unscanned QR has no payment yet.
const STATUS_BY_CODE: Record<string, GatewayChargeStatus> = {
  "00": "paid",
  "05": "cancelled",
  "06": "failed",
};

export interface DokuApi {
  baseUrl: string;
  clientId: string;
  secretKey: string;
}

interface QrisConfig extends DokuApi {
  merchantId: string;
  postalCode: string;
  privateKey: string;
  terminalId: string;
}

interface SnapResponse {
  amount?: { value?: unknown };
  latestTransactionStatus?: unknown;
  qrContent?: unknown;
  referenceNo?: unknown;
  responseCode?: unknown;
}

// All four come from DOKU's QRIS registration. Until they are set, counter
// QRIS keeps using DOKU's hosted page.
export const dokuQrisConfig = (api: DokuApi): QrisConfig | null => {
  const {
    DOKU_PRIVATE_KEY,
    DOKU_QRIS_MERCHANT_ID,
    DOKU_QRIS_TERMINAL_ID,
    DOKU_QRIS_POSTAL_CODE,
  } = process.env;
  if (
    !(
      DOKU_PRIVATE_KEY &&
      DOKU_QRIS_MERCHANT_ID &&
      DOKU_QRIS_TERMINAL_ID &&
      DOKU_QRIS_POSTAL_CODE
    )
  ) {
    return null;
  }
  return {
    ...api,
    // A one-line .env value carries the PEM's line breaks as \n.
    privateKey: DOKU_PRIVATE_KEY.replace(ESCAPED_NEWLINE_REGEX, "\n"),
    merchantId: DOKU_QRIS_MERCHANT_ID,
    terminalId: DOKU_QRIS_TERMINAL_ID,
    postalCode: DOKU_QRIS_POSTAL_CODE,
  };
};

// "2026-11-04T15:30:00+07:00"
const jakartaTimestamp = (date: Date) =>
  `${new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 19)}+07:00`;

// Digits only and unique within the day, as DOKU asks.
const externalId = () => `${Date.now()}${randomInt(100_000, 1_000_000)}`;

const readJson = async (response: Response): Promise<SnapResponse> => {
  const text = await response.text();
  try {
    return JSON.parse(text) as SnapResponse;
  } catch {
    return { responseCode: text };
  }
};

let cachedToken: { expiresAt: number; value: string } | null = null;

export const clearDokuQrisToken = () => {
  cachedToken = null;
};

const accessToken = async (config: QrisConfig) => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  const timestamp = jakartaTimestamp(new Date());
  const response = await fetch(`${config.baseUrl}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CLIENT-KEY": config.clientId,
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": rsaSign(
        "RSA-SHA256",
        Buffer.from(`${config.clientId}|${timestamp}`),
        config.privateKey
      ).toString("base64"),
    },
    body: JSON.stringify({ grantType: "client_credentials" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await readJson(response)) as SnapResponse & {
    accessToken?: unknown;
    expiresIn?: unknown;
  };
  if (!(response.ok && typeof body.accessToken === "string")) {
    throw new Error(
      `DOKU token failed (HTTP ${response.status}): ${JSON.stringify(body)}`
    );
  }
  const lifetimeMs = (Number(body.expiresIn) || 900) * 1000;
  // Renewed a minute early so a token never runs out mid-request.
  cachedToken = {
    value: body.accessToken,
    expiresAt: Date.now() + lifetimeMs - MINUTE_MS,
  };
  return body.accessToken;
};

export const snapSignature = (
  secretKey: string,
  parts: { body: string; path: string; timestamp: string; token: string }
) => {
  const bodyHash = createHash("sha256").update(parts.body).digest("hex");
  return createHmac("sha512", secretKey)
    .update(`POST:${parts.path}:${parts.token}:${bodyHash}:${parts.timestamp}`)
    .digest("base64");
};

const snapPost = async (config: QrisConfig, path: string, payload: unknown) => {
  const token = await accessToken(config);
  const body = JSON.stringify(payload);
  const timestamp = jakartaTimestamp(new Date());
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "CHANNEL-ID": "H2H",
      "X-PARTNER-ID": config.clientId,
      "X-EXTERNAL-ID": externalId(),
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": snapSignature(config.secretKey, {
        body,
        path,
        timestamp,
        token,
      }),
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, body: await readJson(response) };
};

// SNAP's responseCode is the HTTP status, a service code, then a case code.
const isSuccess = ({ status, body }: { status: number; body: SnapResponse }) =>
  status >= 200 &&
  status < 300 &&
  typeof body.responseCode === "string" &&
  body.responseCode.startsWith("200");

const failure = (
  action: string,
  { status, body }: { status: number; body: SnapResponse }
) =>
  new Error(
    `DOKU QRIS ${action} failed (HTTP ${status}): ${JSON.stringify(body)}`
  );

const toDataUrl = (qrContent: string) =>
  `data:image/svg+xml;base64,${Buffer.from(renderSVG(qrContent)).toString("base64")}`;

export const createDokuQris = async (
  config: QrisConfig,
  input: GatewayChargeInput
): Promise<GatewayCharge> => {
  const expiresAt = new Date(Date.now() + input.expiresInMinutes * MINUTE_MS);
  const result = await snapPost(config, GENERATE_PATH, {
    partnerReferenceNo: input.reference,
    amount: { value: input.amount.toFixed(2), currency: "IDR" },
    merchantId: config.merchantId,
    terminalId: config.terminalId,
    validityPeriod: jakartaTimestamp(expiresAt),
    additionalInfo: { postalCode: config.postalCode, feeType: "1" },
  });
  const { qrContent, referenceNo } = result.body;
  if (
    !isSuccess(result) ||
    typeof qrContent !== "string" ||
    qrContent === "" ||
    typeof referenceNo !== "string"
  ) {
    throw failure("generate", result);
  }
  return {
    providerRef: referenceNo,
    qrImageUrl: toDataUrl(qrContent),
    redirectUrl: null,
    expiresAt,
  };
};

export const getDokuQrisStatus = async (
  config: QrisConfig,
  ref: GatewayChargeRef
): Promise<GatewayStatusResult> => {
  const result = await snapPost(config, QUERY_PATH, {
    originalReferenceNo: ref.providerRef,
    originalPartnerReferenceNo: ref.reference,
    serviceCode: "47",
    merchantId: config.merchantId,
  });
  // A QR nobody has scanned yet has no payment to report.
  if (result.status === 404) {
    return { status: "pending", amount: null, raw: result.body };
  }
  if (!isSuccess(result)) {
    throw failure("query", result);
  }
  const code = result.body.latestTransactionStatus;
  const amount = Number(result.body.amount?.value);
  return {
    status: (typeof code === "string" && STATUS_BY_CODE[code]) || "pending",
    amount: result.body.amount && Number.isFinite(amount) ? amount : null,
    raw: result.body,
  };
};

export const cancelDokuQris = async (
  config: QrisConfig,
  ref: GatewayChargeRef
) => {
  if (!ref.providerRef) {
    return;
  }
  try {
    const result = await snapPost(config, EXPIRE_PATH, {
      partnerReferenceNo: ref.reference,
      referenceNo: ref.providerRef,
      merchantId: config.merchantId,
      reason: "cancelled by Fresclean",
    });
    if (!isSuccess(result)) {
      throw failure("cancel", result);
    }
  } catch (error) {
    // The QR still expires on its own at validityPeriod.
    console.warn("DOKU QRIS cancel skipped", ref.reference, error);
  }
};
