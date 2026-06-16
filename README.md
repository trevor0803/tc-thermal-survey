# Treasure Coast Thermal Solutions — Meta Ad Survey Landing Page

A fast, mobile-first lead-capture landing page for Facebook/Meta ads. The
multi-step survey is the primary call to action, with credibility content
(why-us, services, how-it-works, service area) below it.

- **Company:** Treasure Coast Thermal Solutions (disabled-veteran owned, family-run)
- **Phone:** (772) 489-1021
- **Site:** https://tcthermalsolutions.com

## Stack

Static HTML (self-contained inline CSS/JS) in `public/`, plus a Vercel
serverless function `api/lead.js` that forwards leads to a GoHighLevel webhook.

```
public/index.html      # the page + survey (5 steps)
public/images/         # logo.png, spray-foam.webp, blown-in.webp
api/lead.js            # POST /api/lead → GHL webhook (logs if unconfigured)
vercel.json            # cleanUrls + image caching
```

## Survey questions

Same as the Insulflo survey: (1) service needed, (2) property type,
(3) timeline, (4) ZIP code, (5) contact (name / phone / email).

## Setup

1. **Meta Pixel** — replace the placeholder `000000000000000` in
   `public/index.html` with the real Pixel ID before running ads. The `Lead`
   event fires on successful submit; it's guarded so nothing breaks until then.
2. **CRM webhook** — set `GHL_WEBHOOK_URL` in Vercel (`vercel env add
   GHL_WEBHOOK_URL`). Until set, `/api/lead` logs the lead and returns success.

## Local dev

```bash
npm run dev          # vercel dev
```

## Deploy

Connected to GitHub → Vercel; pushing to `main` auto-deploys. Or:

```bash
npm run deploy:prod
```
