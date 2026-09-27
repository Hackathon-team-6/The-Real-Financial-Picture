# Financial X-Ray

**Understand your money. Plan your goals. Make better financial decisions.**

A mobile-first financial decision engine: upload statements (or load demo data), and Financial X-Ray
builds a deterministic model of your income, commitments and spending, then answers questions like
*"I want to buy a bike for ₹1,80,000. Can I afford it?"* with verified numbers.

## Run it (for developers)

```bash
git clone https://github.com/Hackathon-team-6/The-Real-Financial-Picture.git
cd The-Real-Financial-Picture
npm install
npm run dev        # http://localhost:3000  (best viewed at ~390×844)
npm test           # financial engine + sync checks
npm run lint       # typecheck
```

That's all you need. The shared Supabase project (sign-in and cloud sync) is already configured in the
committed `.env`, and the database schema is in `supabase/migrations/`.

**Config files**

| File | Committed? | What goes in it |
|---|---|---|
| `.env` | Yes | Shared public config: the Supabase project URL and publishable key. Nothing secret. |
| `.env.local` | Never | Your secrets and personal overrides, e.g. `ANTHROPIC_API_KEY`. See `.env.example`. |

**Signing in while developing:** until a custom email provider (SMTP) is configured, Supabase only sends
login emails to members of the Supabase organization. Ask the project owner to invite you under
**Supabase → Organization → Team**, or use the app without signing in (data stays in your browser).

**Claude in Ask (optional):** put `ANTHROPIC_API_KEY=...` in `.env.local`. Without it, the built-in
assistant answers using the same engine.

## Demo script (≈2 minutes)

1. Open the app → **Try Demo Data** → watch the analysis → Home shows Income ₹73,000, Committed ₹41,184, **Safe to spend ₹21,816**.
2. **Goals → New goal**: `X-Bike`, ₹1,80,000, April 2027. With ₹25,000 saved, you'll need **₹22,143/month** for 7 months, leaving ₹4,673/month of flexibility.
3. **Ask** → tap the mic → *"Can I buy this bike without affecting my current commitments?"*
4. Try *"Can I buy an iPhone for ₹90,000?"* → **Create this goal** → it appears on Home.
5. What-ifs: *"What if my rent increases by ₹5,000?"*, *"What if I save ₹20,000 every month?"*

The CSV path works too: use **Download a sample CSV** on the upload screen, then upload it.

## Architecture

```
User ─▶ Ask (text / voice) ─▶ /api/ask ─▶ AI assistant (Claude or rule-based)
                                              │ tool calls
                                              ▼
                                   lib/ai/tools.ts  ─▶  lib/financial/* (deterministic engine)
                                              │
                                   verified numbers + UI cards ─▶ explanation
```

| Path | Purpose |
|---|---|
| `lib/financial/parse.ts` | Tolerant CSV parser (header aliases, debit/credit columns, date formats) + PDF text line parser |
| `lib/financial/normalize.ts` | Merchant normalization rules (`AMZN MKTPLACE` → Amazon) + EMI keywords |
| `lib/financial/categorize.ts` | Raw rows → canonical `Transaction` |
| `lib/financial/recurring.ts` | Recurring detection: same merchant, similar amounts (±15%), regular intervals |
| `lib/financial/forecast.ts` | Monthly income, fixed commitments, variable spending, surplus, safe-to-spend |
| `lib/financial/goals.ts` | Goal requirement, timeline, feasibility |
| `lib/financial/simulator.ts` | `simulatePurchase`, `simulateScenario`, `timeToReach` |
| `lib/financial/insights.ts` | Insights computed from the model |
| `lib/ai/tools.ts` | Tool definitions + executor over the snapshot |
| `lib/ai/assistant.ts` | Rule-based intent parsing (amounts like "1.8 lakh", items, timelines) |
| `app/api/ask` | Claude tool-use loop with fallback to the local assistant |
| `app/api/parse-pdf` | PDF text extraction (best-effort, text PDFs only) |

The assistant gets a structured `FinancialSnapshot`, not the raw transaction history.

**Safe to spend** = expected income − fixed commitments − expected variable spending (3-month average) − ₹10,000 safety buffer. It's an estimate.

## Sign-in & cloud sync (optional, Supabase)

Without configuration the app is **local-only**: everything lives in the browser's `localStorage`, no login.
With Supabase configured, users can sign in with an emailed code (or magic link) from **Home → cloud icon → Account**,
and their transactions, goals and savings sync across devices.

**Already set up for this repo:** project `tgahodxijlrwiizarmxr`, with the `user_data` table and its row-level
security policies applied, and its URL and publishable key in `.env`. Deploys (e.g. Vercel) pick them up from
`.env` automatically.

**Still to do in the Supabase dashboard (owner):**
1. **Authentication → Emails → Magic Link:** add `{{ .Token }}` to the template so emails include a 6-digit code.
2. **Authentication → URL Configuration:** set **Site URL** to the deployed URL and add `http://localhost:3000/**` to **Redirect URLs**.
3. To let anyone (not just org members) sign in, configure a custom SMTP provider under **Authentication → SMTP Settings**.

**Using your own Supabase project instead:** create one, run `supabase/migrations/001_user_data.sql` in the
SQL Editor, and set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

**How sync works** (`lib/state/FinanceProvider.tsx`, `lib/state/cloud.ts`):
- Each user has one row holding their data as JSON. Changes are pushed about a second after they happen.
- On sign-in: if the account is empty, this device's data is uploaded. If the account has data, it replaces this device's copy, unless this device has newer edits by the same user. Anonymous or another account's data never overwrites an account.
- Returning to the tab pulls newer changes made on another device. Conflicts are last-write-wins.
- Signing out clears the data from that device. **Delete my synced data** removes the cloud row.

## Privacy

No bank passwords, card PINs, OTPs or banking logins are needed. Without an account, data stays in the
browser's localStorage; signed-in users' data is also stored in their Supabase row. Using Ask sends the
summarized model to the app's API route and, if configured, to Claude.
