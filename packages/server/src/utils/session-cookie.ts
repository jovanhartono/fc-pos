import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
// Only a running Vercel function has a region. A laptop's pulled .env says
// VERCEL=1 too, and its plain-http dev would refuse a Secure cookie.
const isDeployed = Boolean(process.env.VERCEL_REGION);
// __Host- stops another fresclean.id host from planting its own session.
export const SESSION_COOKIE_PREFIX = isDeployed ? "host" : undefined;

// HttpOnly keeps the sign-in out of reach of any script on the page.
const cookieOptions = {
  httpOnly: true,
  secure: isDeployed,
  sameSite: "Lax",
  path: "/",
  prefix: SESSION_COOKIE_PREFIX,
} as const;

export const setSessionCookie = (c: Context, token: string) =>
  setCookie(c, SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

export const clearSessionCookie = (c: Context) =>
  deleteCookie(c, SESSION_COOKIE, cookieOptions);
