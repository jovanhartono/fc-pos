import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { reportError } from "@/utils/report-error";

const DSN = "https://public@o0.ingest.sentry.io/123";
const originalFetch = global.fetch;
const originalDsn = process.env.SENTRY_DSN;

const fetchMock = mock((..._args: unknown[]) =>
  Promise.resolve(new Response(null, { status: 200 }))
);

beforeEach(() => {
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalDsn === undefined) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = originalDsn;
  }
});

describe("reportError", () => {
  it("does nothing when SENTRY_DSN is unset", async () => {
    delete process.env.SENTRY_DSN;

    await reportError(new Error("boom"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never forwards a Drizzle wrapper's bound parameters", async () => {
    process.env.SENTRY_DSN = DSN;
    const err = new Error(
      'Failed query: insert into "customers" ("name") values ($1)\nparams: secret'
    );
    err.name = "DrizzleQueryError";

    await reportError(err);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://o0.ingest.sentry.io/api/123/envelope/");
    expect((options.headers as Record<string, string>)["X-Sentry-Auth"]).toBe(
      "Sentry sentry_version=7, sentry_key=public"
    );
    const body = options.body as string;
    expect(body).not.toContain("secret");
    expect(body).toContain("DrizzleQueryError");
  });

  it("sends a Postgres error as its SQLSTATE code only, no detail", async () => {
    process.env.SENTRY_DSN = DSN;
    const err = Object.assign(new Error("duplicate key value violates"), {
      code: "23505",
      detail: "Key (phone_number)=(+628123456789) already exists.",
    });

    await reportError(err);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as string;
    expect(body).toContain("database error 23505");
    expect(body).not.toContain("duplicate key");
    expect(body).not.toContain("+628123456789");
  });
});
