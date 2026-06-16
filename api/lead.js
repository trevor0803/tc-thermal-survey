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
    return res.status(200).json({ ok: true, note: "logged (no webhook configured)" });
  }

  try {
    const ghlResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!ghlResponse.ok) {
      const detail = await ghlResponse.text().catch(() => "");
      console.error("[TCTS /api/lead] GHL webhook failed:", ghlResponse.status, detail);
      return res.status(502).json({ ok: false, error: "Upstream webhook error" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[TCTS /api/lead] Error forwarding lead:", err);
    return res.status(502).json({ ok: false, error: "Failed to forward lead" });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return {}; }
}
