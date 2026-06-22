// =============================================================================
// /api/lead — Treasure Coast Thermal Solutions lead intake (Vercel Serverless)
//
// Receives the survey lead as JSON from public/index.html and forwards it to
// the GoHighLevel (GHL) CRM inbound webhook.
//
// SETUP: the webhook URL is read from the GHL_WEBHOOK_URL environment variable
// (never hardcoded). Create an inbound webhook in GHL (Automation → Workflows →
// Webhook trigger), copy its URL, and set it in Vercel:
//
//     vercel env add GHL_WEBHOOK_URL
//
// For local dev, put it in .env.local (see .env.example). .env files are
// gitignored so the URL is never committed. If GHL_WEBHOOK_URL is unset, the
// function still returns 200 and just logs the lead (handy before the CRM is
// wired up) — see the fallback below.
// =============================================================================

import crypto from "node:crypto";

// Signed pass-cookie for the /thank-you guard (verified in middleware.js).
// Minted only after a successful submission; short TTL so it can't be reused.
const LEAD_COOKIE = "tcts_lead";
const COOKIE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function setLeadCookie(res) {
  const secret = process.env.LEAD_COOKIE_SECRET;
  if (!secret) {
    // Without a secret we can't sign; the /thank-you guard fails open, so the
    // page still works — but log loudly so the misconfig is visible.
    console.error("[TCTS /api/lead] LEAD_COOKIE_SECRET not set — cannot mint /thank-you pass cookie");
    return;
  }
  const exp = Date.now() + COOKIE_TTL_MS;
  const sig = crypto.createHmac("sha256", secret).update(String(exp), "utf8").digest("hex");
  const value = `${exp}.${sig}`;
  res.setHeader(
    "Set-Cookie",
    `${LEAD_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const lead = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  // --- Minimal server-side validation (front-end already validates) ---
  if (!lead || !lead.first_name || !lead.last_name || !lead.phone || !lead.email) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }

  // Map the survey's lead object to GHL contact / custom fields.
  const payload = {
    first_name:    lead.first_name,
    last_name:     lead.last_name,
    phone:         lead.phone,
    email:         lead.email,
    postal_code:   lead.zip,
    service:       lead.service,
    property_type: lead.propertyType,
    timeline:      lead.timeline,
    utm_source:    lead.utm_source,
    utm_medium:    lead.utm_medium,
    utm_campaign:  lead.utm_campaign,
    utm_term:      lead.utm_term,
    utm_content:   lead.utm_content,
    fbclid:        lead.fbclid,
    page_url:      lead.page_url,
    referrer:      lead.referrer,
    source:        "Meta Ad — TCTS Survey LP"
  };

  const webhookUrl = process.env.GHL_WEBHOOK_URL;

  // No CRM wired yet → log and succeed so the user still sees the success screen.
  if (!webhookUrl) {
    console.log("[TCTS /api/lead] No GHL_WEBHOOK_URL set — lead received:", JSON.stringify(payload));
    setLeadCookie(res);
    return res.status(200).json({ ok: true, note: "logged (no webhook configured)" });
  }

  // Identifier to correlate this lead across log lines in Vercel.
  const who = `${payload.email} / ${payload.phone}`;

  try {
    console.log("[TCTS /api/lead] Forwarding lead to GHL:", who);

    const ghlResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Always read the body once so we can log it on either path. GHL inbound
    // webhooks frequently return 200 even when they reject the payload, so the
    // body is logged on success too — a 2xx alone does not prove delivery.
    const body = await ghlResponse.text().catch(() => "");

    if (!ghlResponse.ok) {
      console.error(
        "[TCTS /api/lead] GHL forward FAILED:",
        "status=" + ghlResponse.status,
        "lead=" + who,
        "body=" + truncate(body)
      );
      return res.status(502).json({ ok: false, error: "Upstream webhook error" });
    }

    console.log(
      "[TCTS /api/lead] GHL forward OK:",
      "status=" + ghlResponse.status,
      "lead=" + who,
      "body=" + truncate(body)
    );
    setLeadCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Network error, DNS failure, timeout, etc. — the lead did NOT reach GHL.
    console.error("[TCTS /api/lead] GHL forward ERROR (lead not delivered):", "lead=" + who, err);
    return res.status(502).json({ ok: false, error: "Failed to forward lead" });
  }
}

function truncate(s, max = 1000) {
  if (!s) return "(empty)";
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return {}; }
}
