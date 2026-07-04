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

## Planned (rough priority order)

1. **Monthly insight summary** — one tap on the dashboard produces a short
   narrative for the selected period: biggest categories, deltas vs the
   previous period, notable one-offs. Input is aggregated numbers only
   (category totals), not raw records — cheap and privacy-friendlier.
2. **Smart import categorisation** — during CSV import, rows that would land
   in auto-created categories get an AI pass that maps them onto your
   existing category set (batch prompt, one call per ~50 rows), with a
   review step before committing.
3. **Ask your data** — a small chat box that translates questions like "how
   much did we spend on eating out in March?" into safe, server-side
   aggregate queries (the model produces a structured query plan, never SQL;
   the server executes only whitelisted aggregations) and answers with the
   computed numbers.
4. **Unusual-spend nudges** — on demand (not scheduled), compare the current
   period against your history and flag anomalies: "Transport is 3× your
   usual", "New recurring charge detected: ₹499 monthly".
5. **Recurring-expense detection** — find likely subscriptions/EMIs from
   repeated amount+category patterns and offer a one-tap monthly reminder
   list.
6. **Receipt photo → record** (needs a vision-capable model) — snap a bill,
   get a pre-filled record proposal, same review-before-save flow.
7. **Budget coach** — set per-category monthly budgets, then get a short
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
