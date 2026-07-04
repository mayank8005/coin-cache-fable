# AI features roadmap

CoinCache's AI layer is strictly **bring-your-own-model** and per-user: each
user connects their own Ollama server (fully private) or OpenAI account from
**Settings → AI features**, picks a model from the live model list, and every
AI call is proxied server-side (the key is AES-256-GCM encrypted at rest and
never reaches the browser). AI runs only when explicitly invoked — nothing is
sent to any provider in the background, keeping the app's zero-third-parties
promise intact for users who don't opt in.

Both providers are driven through the OpenAI-compatible API
(`GET /models`, `POST /chat/completions`), so any other compatible endpoint
(LM Studio, llama.cpp server, OpenRouter, …) works by pointing the base URL
at it.

## Shipped

- ✅ **AI settings screen** (`/settings/ai`) — provider, base URL, encrypted
  key storage, live model listing, model selection, disable/remove.
- ✅ **✨ Natural-language quick add** — "auto to office 45", "groceries 1200
  by card yesterday", "salary 50k" → parsed into type, amount, category,
  account, date and note against *your* categories/accounts; you review the
  proposal before anything is saved (all writes go through the normal
  ownership-checked path).
- ✅ **💡 Period insight summary** — "Explain this period" on the dashboard
  produces a short narrative: biggest categories, deltas vs the previous
  period. Input is aggregated numbers only (category totals), never raw
  records.
- ✅ **🗂 Smart import categorisation** — during CSV import, unknown category
  names get one AI pass mapping them onto your existing set, then a review
  step (change any mapping or keep "create new") before anything is
  imported. Falls back gracefully when AI is unreachable.
- ✅ **💬 Ask your data** — chat screen (`/assistant`) that translates
  questions like "how much did we spend on eating out in March?" into a
  strict JSON query plan (never SQL); the server executes only whitelisted
  aggregations scoped to your user id and formats the answer
  deterministically from the computed numbers.
- ✅ **📷 Receipt photo → record** — inside Quick add: snap/upload a bill,
  it's downscaled client-side, read by a vision-capable model, and returned
  as the same review-before-save proposal.

## Planned (rough priority order)

1. **Unusual-spend nudges** — on demand (not scheduled), compare the current
   period against your history and flag anomalies: "Transport is 3× your
   usual", "New recurring charge detected: ₹499 monthly".
2. **Recurring-expense detection** — find likely subscriptions/EMIs from
   repeated amount+category patterns and offer a one-tap monthly reminder
   list.
3. **Budget coach** — set per-category monthly budgets, then get a short
   AI-written weekly digest of pace ("Food is at 80% with 10 days left").

## Design rules for every AI feature

- Opt-in, per-user, and degrades gracefully — the app is fully usable with AI
  off; buttons simply don't render.
- The model proposes, the user disposes: no AI output is ever written to the
  database without explicit confirmation.
- Send the minimum: category/account *names* and aggregates where possible,
  raw notes only when the feature requires them (quick add sends only what
  you typed).
- All calls server-side with timeouts; provider errors surface as friendly
  messages, never break the page.
