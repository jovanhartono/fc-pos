// Bytecode-compiled builds break @sentry/bun, so this sends Sentry's envelope
// format by hand instead of pulling in the SDK. Best-effort only: a Sentry
// outage must never turn one broken request into two.

const LEADING_SLASH_REGEX = /^\//;

function parseDsn(dsn: string) {
  const url = new URL(dsn);
  return {
    publicKey: url.username,
    host: url.host,
    projectId: url.pathname.replace(LEADING_SLASH_REGEX, ""),
  };
}

const hasStringCode = (value: unknown): value is { code: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { code?: unknown }).code === "string";

// A Postgres error's detail can quote the row that broke the save, and a
// Drizzle wrapper's message repeats every bound parameter — a customer's
// phone number or a new user's password hash. Neither is safe to forward.
function describeError(err: unknown): { type: string; value: string } {
  const name = err instanceof Error ? err.name : "Error";

  if (hasStringCode(err)) {
    return { type: name, value: `database error ${err.code}` };
  }

  const message = err instanceof Error ? err.message : String(err);
  if (name === "DrizzleQueryError" || message.includes("params:")) {
    return { type: name, value: name };
  }

  return { type: name, value: message };
}

export async function reportError(
  err: unknown,
  request?: Request
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  try {
    const { publicKey, host, projectId } = parseDsn(dsn);
    const eventId = crypto.randomUUID().replaceAll("-", "");
    const sentAt = new Date().toISOString();
    const { type, value } = describeError(err);

    const envelope = `${JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn })}
${JSON.stringify({ type: "event" })}
${JSON.stringify({
  event_id: eventId,
  timestamp: sentAt,
  platform: "javascript",
  level: "error",
  exception: { values: [{ type, value }] },
  // The POS customer lookup carries `?phone=` on every drop-off — the query
  // string is not safe to forward, so only the path goes to Sentry.
  request: request && {
    method: request.method,
    url: new URL(request.url).pathname,
  },
})}`;

    await fetch(`https://${host}/api/${projectId}/envelope/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Swallowed: reporting the error must never throw a second one.
  }
}
