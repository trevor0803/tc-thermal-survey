// =============================================================================
// Edge Middleware — server-side guard for /thank-you
//
// /thank-you must only be viewable right after a real form submission. On a
// successful POST, /api/lead mints a signed, 5-minute "tcts_lead" cookie. This
// middleware verifies that cookie (HMAC-SHA256) before the page is served. A
// bot, crawler, direct hit, refresh after expiry, or anyone without a valid
// cookie is redirected back to the form — so the Meta Lead conversion on this
// page can't be triggered by non-submitters.
//
// This is the SERVER layer. The sessionStorage check in thank-you.html remains
// as a second, client-side layer for the pixel fire itself.
// =============================================================================

import { next } from "@vercel/edge";

export const config = {
  matcher: ["/thank-you", "/thank-you.html"],
};

const LEAD_COOKIE = "tcts_lead";

export default async function middleware(request) {
  const secret = process.env.LEAD_COOKIE_SECRET;

  // Misconfiguration (no secret) → fail OPEN so a real conversion is never
  // blocked. Logged loudly; the guard is effectively off until the env is set.
  if (!secret) {
    console.error("[middleware] LEAD_COOKIE_SECRET not set — /thank-you guard is OPEN");
    return next();
  }

  const token = readCookie(request.headers.get("cookie"), LEAD_COOKIE);

  if (await isValidToken(token, secret)) {
    return next(); // genuine submission → allow /thank-you
  }

  // Missing / invalid / expired → bounce back to the form.
  return Response.redirect(new URL("/", request.url), 307);
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > -1 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

async function isValidToken(token, secret) {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false; // expired

  const expected = await hmacHex(secret, exp);
  return timingSafeEqual(expected, sig);
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
