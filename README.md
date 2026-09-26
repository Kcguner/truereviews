# TrueReviews

**An honest, single-page summary of Google Maps reviews — in 10 languages, no sign-up and no cost.**

The user pastes a Google Maps business link, the system reads the latest reviews
and produces a satisfaction score, the recurring praise/complaint themes, and one
concrete weekly action item. The preview is instant and free; the full report
unlocks after email confirmation. The target audience is small business owners
who have a real storefront on Google Maps (restaurants, cafés, hotels, pharmacies,
services, etc.) — an honest summary that fits on a single screen and requires no
dashboard or setup.

[![CI](https://github.com/Kcguner/truereviews/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Kcguner/truereviews/actions/workflows/ci.yml)
[![Vitest](https://img.shields.io/badge/test-vitest%205.0.1-6E9F37?logo=vitest&logoColor=FFD34E)](https://vitest.dev)

- Source code: [github.com/Kcguner/truereviews](https://github.com/Kcguner/truereviews)
- License: MIT
- Cost: **$0** (runs entirely on the free tiers listed below)

## Table of Contents

- [Demo](#-demo)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Multi-language](#-multi-language)
- [Security & KVKK](#-security--kvkk)
- [Cost](#-cost)
- [Setup](#-setup)
- [Environment Variables](#-environment-variables)
- [Test & CI](#-test--ci)
- [Deploy](#-deploy)
- [License](#-license)
- [Notes](#-notes)

## 🎬 Demo

**https://get-truereviews.vercel.app**

_The live address is exactly the `APP_URL` value in `.env.local`; canonical, Open
Graph and sitemap are all generated from this variable._

<!-- Image: save a screenshot of the report screen as docs/screenshot.png,
     then uncomment the line below. -->
<!-- ![TrueReviews report screen](docs/screenshot.png) -->

## ✨ Features

- **One field, one click:** A Google Maps business link (long `google.com/maps/place/…`,
  `goo.gl`, `maps.app.goo.gl` and `g.page` short links) is pasted in; the server
  verifies that the link really is a business page. Includes a paste button and
  a "try a sample business" shortcut.
- **Server-locked preview (email wall):** The `/api/analyze` response contains
  only a `reportId` plus preview fields. The full report (themes + action item)
  is **never** sent to the browser under any condition; hiding it with CSS blur
  or a modal is not used — the data stays on the server.
- **Real review analysis:** The `compass/google-maps-reviews-scraper` actor on
  Apify is run, and at most `MAX_REVIEWS` reviews are fetched.
- **Report generated in the target language:** Gemma writes the analysis **in the
  target language**, independently of the language the reviews were written in.
  There is no separate translation layer.
- **Strict JSON discipline:** The prompt asks for JSON only; any markdown fence or
  leading/trailing explanation the model adds is stripped with `extractJson`, and
  the field shape is validated with `isValidReport`. Invalid output is not
  silently swallowed — it falls back to a heuristic report and is flagged
  `mocked: true`.
- **Resilient AI calls:** A `4xx` is treated as a configuration error and thrown
  loudly; a persistent `5xx` / network error is retried once after a short wait,
  and if it still fails the user gets a report anyway.
- **24-hour cache:** For the same business + same language, a repeat analysis does
  not hit Apify or Gemma. Mock results are *not* written to the cache — so a real
  analysis can be retried on the next attempt.
- **Two-tier quota:** An hourly per-IP counter plus a global daily analysis
  counter, kept in Redis with TTLs; returns `429` when the quota is exceeded.
- **Double opt-in email:** The full report does not open until the confirmation
  link in the email is clicked. The confirmation token is valid for 48 hours.
- **The token is not the report:** The `/[locale]/rapor?token=…` page calls
  `GET /api/verify`; the full report is returned only there, server-side verified,
  and **no new Apify/Gemma call is made**.
- **Disposable email block:** Providers such as mailinator / 10minutemail are
  rejected via the `disposable-email-domains` list; GDPR consent is a mandatory
  step before the email lock.
- **Bot protection:** Cloudflare Turnstile; without a key the form keeps working,
  and in production this silent degradation is reported loudly via a
  `[PROD-GUARD]` log.
- **Single-page report view:** Animated semicircle score gauge (0–100),
  praise/neutral/complaint distribution bar, theme list (with how many reviews
  mention it and a real review quote) and a one-sentence action block. One-click
  printing via the browser's PDF conversion.
- **10 languages, full i18n:** The interface, legal pages, FAQ, meta tags and OG
  image are generated in the selected language. Full RTL for Arabic and Persian.
- **Legal infrastructure:** `faq`, `privacy`, `gdpr` and `contact` pages in 10
  languages; the mandatory GDPR consent text is written separately for each
  language.
- **SEO / GEO, 10 languages:** All metadata is generated from a single source
  ([`lib/seo.ts`](lib/seo.ts)) so the 10 locales cannot drift apart. Per-language
  `canonical` + `hreflang` (including x-default) on the homepage **and** on all 40
  legal pages, `og:locale` + `og:locale:alternate`, Twitter cards, a
  `sitemap.xml` where every URL carries its own `alternates.languages` map, a
  `robots.txt` that excludes `/api/` and `/*/rapor` (also for AI crawlers), a
  per-locale dynamic OG image, and a multilingual `public/llms.txt`.
  JSON-LD: `Organization` / `WebSite` / `WebPage` / `SoftwareApplication` /
  `FAQPage` on the homepage, `WebPage` + `BreadcrumbList` + `FAQPage` on the
  legal pages. Titles lead with the primary keyword and keep the brand at the end;
  the description of every locale contains its own primary keyword (enforced by
  `tests/seo.test.ts`).
- **Demo mode with no keys:** Works end to end without a single API key, using
  realistic mock reviews + heuristic (average-based) analysis.

## 🏗️ Architecture

```
User
  │
  ├─ GET /[locale]                     next-intl middleware · localePrefix: 'always'
  │                                    (NEXT_LOCALE cookie → Accept-Language → 'tr')
  │
  ├─ POST /api/analyze  { placeUrl, locale, turnstileToken }
  │    │
  │    ├─ 1) URL validation .......... google.* · goo.gl · maps.app.goo.gl · g.page
  │    ├─ 2) Turnstile ................ verifies if secret is set, else passive mode
  │    ├─ 3) Quota ................... Redis: IP/hour (TTL 1h) + global/day (TTL 24h)
  │    ├─ 4) Cache ................... same business + locale, 24h → on HIT skip 5-6
  │    ├─ 5) Apify ................... compass/google-maps-reviews-scraper → ≤ MAX_REVIEWS reviews
  │    ├─ 6) Gemma (Google AI Studio)  JSON in the target language: score, summary,
  │    │                               top_complaints, top_praises, action_suggestion
  │    │                               4xx → error · 5xx/network → heuristic report
  │    └─ 7) Redis ................... ya:report:{uuid} + ya:place:{key}::{locale} (24h)
  │
  └─ ◀── { reportId, preview }         THE FULL REPORT IS NOT RETURNED

  ── email wall: unlock the report ──────────────────────────────────────────

  ├─ POST /api/lead  { reportId, email }
  │    ├─ format validation + disposable-email-domain check
  │    ├─ Turnstile
  │    ├─ 64-hex verification token (TTL 48h) + lead → verified: '0'
  │    └─ Brevo /v3/smtp/email ....... confirmation link: /[locale]/rapor?token=…
  │
  ├─ user clicks the confirmation link → GET /[locale]/rapor?token=…
  │
  └─ GET /api/verify?token=…
       ├─ if the token is valid lead → verified: '1', the report is unlocked
       └─ ◀── { report, businessName, reviewCount, createdAt }
              (no NEW request is sent to Apify/Gemma)
```

### Why the "second chance" does not create a second cost

The "1st chance is a free preview, 2nd chance is the full report after email
confirmation" model told to the user is a **user experience** construct; on the
backend it is not two separate analyses. `/api/analyze` writes the full report to
Redis while producing it and hands over only the `reportId`; `/api/lead` and
`/api/verify` then unlock that **already existing** record. Therefore:

- there is 1 Apify + 1 Gemma call per user, not two;
- the second "chance" costs nothing — because it never calls an external service;
- thanks to the 24-hour cache, when a second user wants to analyze the same
  business, the external services are not hit again either.

This separation is the foundation of staying sustainable on free tiers (Apify's
monthly credit, AI Studio's daily quota). The application layer enforces it as
well: `/api/analyze` only returns the preview, no route other than
`/api/verify` ever returns the full report, and `robots.txt` keeps `/rapor` pages
out of the index.

## 🛠️ Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Framework | **Next.js 14.2.35** (App Router) | SSR, route handlers and static output in one project; no separate backend |
| React | **React 18.3.1** | App Router and the Server/Client Component split |
| i18n | **next-intl 3.26.5** | Path-based locale routing (`/en/…`), `NEXT_LOCALE` cookie, server-side message loading |
| Styling | **Tailwind CSS 3.4** | Utility layer + a token-based custom design system in `globals.css` (light/dark) |
| Cache / Quota | **Upstash Redis** (`@upstash/redis`) | Persistent state on serverless: report cache, TTL quota counters, verification tokens, leads |
| Review scraping | **Apify** (`compass/google-maps-reviews-scraper`) | Third-party maintenance even if the Google Maps page structure changes; monthly credit that requires no credit card |
| AI analysis | **Google AI Studio / Gemini API** (`gemma-4-31b-it`) | Free quota, structured output via `responseMimeType: application/json` |
| Email | **Brevo** (`/v3/smtp/email`) | Double opt-in with a verified sender; 300 free emails per day |
| Bot protection | **Cloudflare Turnstile** | No reCAPTCHA, privacy friendly; automatically passive when no key is set |
| Hosting | **Vercel** (`vercel.json`, region `fra1`) | Zero-config deploy with Next.js, automatic HTTPS, a fixed European region via `fra1` |
| Testing | **Vitest 5.0.1** + Vite 8 | Fast, dependency-light; AI/email branch tests with a `fetch` stub |
| Types | **TypeScript 5.9** (`strict`) | Type safety for route handlers and the report schema |

## 🌍 Multi-language

The 10 supported locales ([`i18n.config.ts`](i18n.config.ts)):

| Code | Language | Code | Language |
|---|---|---|---|
| `tr` | Türkçe *(default)* | `fr` | Français |
| `en` | English | `es` | Español |
| `de` | Deutsch | `nl` | Nederlands |
| `ar` | العربية *(RTL)* | `fa` | فارسی *(RTL)* |
| `ru` | Русский | `az` | Azərbaycanca |

- **Path-based routing:** Every language lives under `/tr/`, `/en/`, `/ar/` …
  (`localePrefix: 'always'`). `middleware.ts` resolves requests in the order
  `NEXT_LOCALE` cookie → `Accept-Language` → `tr`; `app/[locale]/layout.tsx`
  returns `notFound()` for a locale that is not in the list.
- **Interface text:** A single file per locale, `messages/{locale}.json`, with
  `useTranslations` in server components and `NextIntlClientProvider` in client
  components.
- **Report content:** There is **no** separate translation layer. `lib/gemma.ts`
  appends a "produce the response in language X" instruction to the prompt; the
  model reads the reviews in whatever language they are written in and produces
  the analysis directly in the target language. This is both faster and cheaper
  in tokens.
- **Per-locale SEO:** [`lib/seo.ts`](lib/seo.ts) is the single source for the
  `title`, `description`, `keywords`, `og:locale`, currency and hreflang maps.
  Every indexable page (homepage + legal) calls `getAlternates(locale, slug?)`,
  which returns the canonical URL plus a map of all 10 locales of *that same
  page* and `x-default` → the site root. `getOgLocaleAlternates()` produces the
  nine `og:locale:alternate` values. Titles lead with the primary keyword
  ("Google Yorum Analizi", "Analyse avis Google", …) and keep the brand at the
  end; every description contains its own primary keyword. `tests/seo.test.ts`
  locks all of this down per locale.
- **`x-default` points at the site root:** the bare `/` negotiates the visitor's
  language (`NEXT_LOCALE` → `Accept-Language` → `tr`) and redirects, so an
  unmatched visitor still lands in a language they can read.
- **Scope difference:** The legal texts are full text for `tr` / `en` / `de`; in
  the other languages English content plus a translation note shown to the user
  kicks in. The FAQ, the GDPR consent text and the legal page metadata, on the
  other hand, are defined in all 10 languages and verified by tests.

## 🔒 Security & KVKK

*KVKK is the Turkish data protection law (GDPR equivalent); it is the strictest
regime the app is designed for.*

**Abuse protection**

- **Turnstile:** The `/api/analyze` and `/api/lead` endpoints perform a
  server-side `siteverify` call. If `TURNSTILE_SECRET_KEY` is not defined,
  verification **falls back to passive mode** and the form keeps working; in
  production this silent degradation is logged as `[PROD-GUARD]` via
  `lib/env-guard.ts` — it is not hidden.
- **Quota and rate limit:** Two counters are kept in Redis —
  `RATE_LIMIT_PER_HOUR` (default 2, per IP) and `DAILY_NEW_ANALYSIS_LIMIT`
  (default 12, global). The counters get a TTL on first write (1 hour / 24 hours),
  so they clean themselves up. When the quota is exceeded, `429` and a
  user-friendly message are returned.
- **Disposable email block:** Domain matching is done against the static list of
  the `disposable-email-domains` package; the list is tested with real examples
  in `tests/validation.test.ts`.
- **Security headers** ([`next.config.mjs`](next.config.mjs), on all paths):
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: SAMEORIGIN`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  `poweredByHeader` is disabled.
- **Strict double opt-in:** For the full report, an email address alone is not
  enough; the confirmation link must be clicked. The token consists of 64
  hexadecimal characters, is bound to a single report and expires after 48 hours.

**KVKK and data**

- **Review content is not modified, deleted or purchased.** Quotes are shortened
  from real reviews with `clipQuote` without being cut mid-word; the rating
  distribution and theme counts are aggregate statistics.
- **No ads, no mass mail.** Email is only the double opt-in confirmation and an
  optional one-off update; the KVKK text and the homepage FAQ state this
  explicitly.
- **Cookies:** No tracking cookie is used; the theme preference is stored only in
  `localStorage`. Analytics is optional and is not rendered at all when no data
  setting exists.
- **KVKK consent is mandatory:** The report is not unlocked until the checkbox
  in the email form is ticked; the consent text is written separately for every
  language.
- **Legal pages:** `/{locale}/gizlilik`, `/{locale}/kvkk`, `/{locale}/sss` and
  `/{locale}/iletisim` in 10 languages. The data collected, the purpose of use,
  retention and deletion, third parties and the rights under art. 11 are written
  out explicitly.

**Developer convenience (dev/test)**

`ADMIN_EMAILS` (a comma-separated list of addresses) and `ADMIN_BYPASS_TOKEN`
(server-only, a hidden test key sent as a request header or in the body) exist to
speed up test flows: the listed addresses see the full report without waiting for
the confirmation email, and requests with the correct key get a quota exemption.
When left empty they are **disabled** and the normal user flow is completely
unchanged. These values are not embedded in the browser or bundled with the
code; they are only effective in the environments where they are defined. This is
not a user-facing feature, it is for development/testing.

## 💰 Cost

**The entire application runs on free tiers: total cost $0.**

| Service | Free tier | What it is used for here |
|---|---|---|
| Vercel | Hobby plan | Hosting + route handlers |
| Upstash Redis | Free database | Report cache, quota, tokens, leads |
| Apify | **$5** monthly credit, no credit card required | ~20 reviews per analysis → hundreds of analyses per month |
| Google AI Studio | Daily free request quota | A single Gemma call from `MAX_REVIEWS` reviews |
| Brevo | 300 emails per day | Only the double opt-in confirmation |
| Cloudflare Turnstile | Free | Bot protection |
| next-intl, Tailwind, Vitest, TypeScript | Open source packages | No server/service cost |

To be honest, this is not a guarantee that it will "always stay free": the
providers' free terms may change, and buying a domain name creates a real annual
cost. The commitment is that the architecture scales independently of these
changes.

**Redis is mandatory in production.** Without an Upstash connection, the quota,
cache and tokens fall back to in-memory `Map`s. That is enough for development;
Vercel, however, is a multi-instance, short-lived environment — every instance and
every deploy forgets its own counters, reports and confirmation tokens fly away,
and the limits are breached. `lib/redis.ts` also reports this state in production
via a `[PROD-GUARD]` log.

## 🚀 Setup

**Works end to end without a single API key:** realistic mock reviews +
heuristic (average-based) analysis. Setup is two commands.

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

</details>

<details>
<summary><b>macOS / Linux (bash)</b></summary>

```bash
cp .env.example .env.local
npm install
npm run dev
```

</details>

Then open **`http://localhost:3000/en`** in your browser:

1. Paste any Google Maps business link into the form field (or use the "Try a
   sample business" shortcut).
2. The review loading stages play out; even on a fast response at least 3.6 s is
   waited out (not an artificial delay, but a safety margin against an empty
   screen appearance on a fast setup) and the **preview** report appears.
3. Enter an email address and tick the GDPR consent. Because there is no Brevo
   key, no email is sent; the confirmation link appears in the "developer
   preview" box on the screen and as a `[MOCK-EMAIL]` line in the terminal.
4. Click that link — `/{locale}/rapor?token=…` opens and the full report is shown.

To run with the real services all you have to do is fill in the keys in
`.env.local` — [`.env.example`](.env.example) comes as a template. The full list
and the behavior of each key when it is missing are in the table below.

## 🔑 Environment Variables

| Variable | Required | Description | If missing |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Yes in production | Upstash Redis REST endpoint | Falls back to in-memory mode: counters are lost in a multi-instance environment, reports and tokens fly away |
| `UPSTASH_REDIS_REST_TOKEN` | Yes in production | Upstash Redis REST token | Same in-memory fallback |
| `APIFY_API_TOKEN` | No | Apify API token | Realistic **mock reviews** are returned; no Apify credit is spent |
| `APIFY_ACTOR_ID` | No | The actor to use | `compass/google-maps-reviews-scraper` is used by default |
| `GOOGLE_AI_API_KEY` | No | Google AI Studio key | **Heuristic analysis**: a summary based on the average rating, theme counts and a one-sentence suggestion |
| `GEMMA_MODEL` | No | The real model id in AI Studio | `gemma-4-31b-it` is used. A wrong id → API 404 → no report can be produced |
| `BREVO_API_KEY` | No | Brevo API key | **Mock email mode**: the confirmation link is logged and returned as `devPreviewUrl` in the API response; the double opt-in flow is still enforced |
| `BREVO_FROM` | Yes if `BREVO_API_KEY` is set | Verified sender, e.g. `TrueReviews <address@domain>` | When a key is present the request **throws an explicit error** — no silent sending. The `ornek.com` / `example.com` placeholders are also rejected |
| `ADMIN_EMAILS` | No | Comma-separated developer emails | If empty, admin bypass is off, normal flow |
| `ADMIN_BYPASS_TOKEN` | No | Server-only test key for the quota exemption | If empty there is no exemption; no request can obtain one |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Turnstile site key | The widget is not rendered |
| `TURNSTILE_SECRET_KEY` | No | Turnstile secret key | Verification **falls back to passive mode** (the form works, without protection); logged as `[PROD-GUARD]` in production |
| `APP_URL` | Yes in production | Site root URL (private env) | The `https://get-truereviews.vercel.app` fallback (`lib/site.ts`) is used — canonical, OG, sitemap and JSON-LD are generated for that address |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | No | Search Console verification token | The `verification.google` meta tag is not added |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | No | Privacy-friendly analytics domain | Analytics is not rendered at all |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | No | Self-hosted Plausible script address | `https://plausible.io/js/script.js` is used |
| `NEXT_PUBLIC_CONTACT_EMAIL` | No | The address shown on the contact page | The email block is not shown on the contact page |
| `DAILY_NEW_ANALYSIS_LIMIT` | No | Global daily analysis quota | `12` |
| `RATE_LIMIT_PER_HOUR` | No | Hourly request count per IP | `2` |
| `CACHE_TTL_HOURS` | No | Report cache and Redis TTL | `24` |
| `MAX_REVIEWS` | No | Maximum number of reviews to fetch (upper bound 50) | `20` |

## 🧪 Test & CI

```bash
npm test            # vitest run  →  11 files, 58 tests
npx tsc --noEmit    # type check
npm run build       # production build
```

The tests run without any external services, via a `fetch` stub and the
in-memory fallback; there are no secrets in CI.

| Test file | Coverage |
|---|---|
| [`tests/gemma.test.ts`](tests/gemma.test.ts) | Default model constant, prompt schema and language reflection, text-free reviews entering the prompt as a distribution, `extractJson` fence/stray-text extraction, persistent 5xx → heuristic, `4xx` → error, `clipQuote` word boundary |
| [`tests/validation.test.ts`](tests/validation.test.ts) | Email format (accept/reject), known disposable domains, Turnstile passive mode |
| [`tests/storage.test.ts`](tests/storage.test.ts) | Quota (hourly limit), report save/get/cache, `indexPlace:false`, token generation and idempotency within TTL, `upsertLead` |
| [`tests/admin.test.ts`](tests/admin.test.ts) | Admin email list (normalization), bypass key matching and empty values |
| [`tests/url.test.ts`](tests/url.test.ts) | Google Maps link accept/reject (`google.*`, `goo.gl`, `g.page`) |
| [`tests/legal.test.ts`](tests/legal.test.ts) | 10 locales × 4 legal pages metadata correctness, slug validation, GDPR consent text coverage |
| [`tests/faq.test.ts`](tests/faq.test.ts) | FAQ coverage in 10 languages, English fallback for an unknown language, heading presence |
| [`tests/email.test.ts`](tests/email.test.ts) | Mock mode when no key, explicit error for an invalid `BREVO_FROM` when a key is present |
| [`tests/site.test.ts`](tests/site.test.ts) | `getSiteUrl` fallback and trailing slash cleanup |
| [`tests/notebook.test.ts`](tests/notebook.test.ts) | 0–100 score band thresholds and band colors |
| [`tests/seo.test.ts`](tests/seo.test.ts) | Title/description length limits in 10 locales, primary keyword present in title **and** description, per-locale uniqueness, hreflang map (10 locales + x-default) for home and legal pages, `og:locale` BCP-47 format, `locale:alternate` completeness, currency map |

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): runs on pushes to
`master` and `main` and on all pull requests. On `ubuntu-latest` + Node 20 it runs
the steps `npm ci --legacy-peer-deps` → `npm test` → `npx tsc --noEmit` →
`npm run build` in order. The status badge is at the top of the README.

## 🚀 Deploy

1. Push the repo to GitHub: **github.com/Kcguner/truereviews**
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
   Next.js is detected as the framework, and `vercel.json` (`framework: nextjs`,
   `regions: ["fra1"]`) and `next.config.mjs` are recognized automatically.
3. Add the keys above under **Environment Variables**. On Vercel, define the envs
   separately for **Production _and_ Preview**; otherwise every preview deploy
   silently falls back to mock mode.
4. Set `APP_URL` to the real domain.
5. Deploy. `sitemap.xml` and `robots.txt` are generated automatically through the
   Next.js metadata routes [`app/sitemap.ts`](app/sitemap.ts) and
   [`app/robots.ts`](app/robots.ts); no extra `postbuild` step is needed.

Things to watch out for:

- **`APP_URL` is a private env — it has no `NEXT_PUBLIC_` prefix.** The code does
  not read `NEXT_PUBLIC_APP_URL`; adding such a variable would do nothing. The
  site root URL comes from a single place on the server side, `lib/site.ts`.
- **`APP_URL` must be present at BUILD time, not just at runtime.** All 70 pages
  plus `sitemap.xml`, `robots.txt` and `manifest.webmanifest` are prerendered
  (`○ Static`), so every `canonical`, `hreflang` and `og:url` is baked into the
  HTML during `next build`. Building without `APP_URL` bakes in the
  `get-truereviews.vercel.app` fallback (or `localhost:3000` locally) and you
  ship wrong absolute URLs. Vercel exposes env vars to the build by default;
  elsewhere run `APP_URL=… npm run build`.
- **`NEXT_PUBLIC_*` changes are embedded at build time.** If you changed the
  Turnstile site key, the Google verification token, Plausible or the contact
  email, you need a **Redeploy**; only updating the env is not enough.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` must be defined before
  going to production. `TURNSTILE_SECRET_KEY` should also be added so that the
  quotas are actually tightened.
- If the domain changes, `APP_URL` must be updated **and the project rebuilt**;
  `sitemap`, `canonical`, `hreflang` and JSON-LD are all generated from this
  single value.

## 📄 License

[MIT](https://opensource.org/licenses/MIT). Use it freely, modify it and
redistribute it.

## 📚 Notes

- [`docs/proje-plani.md`](docs/proje-plani.md) — the full business model, the
  rationale behind the "2 chances" logic, the quota calculation and the security
  architecture. This is the document the cost claims are based on.
- [`docs/tasarim.txt`](docs/tasarim.txt) — interface and visual language notes.
- The OG image is a **route handler**
  ([`app/[locale]/opengraph-image/route.tsx`](app/[locale]/opengraph-image/route.tsx)),
  not file-based metadata. File-based `opengraph-image.tsx` overwrites the whole
  `openGraph.images` value, so a static `export const alt` pushed the same
  Turkish alt text into all 10 locales (and removing it dropped `alt` entirely).
  As a route handler the image is only a URL; `alt` comes from
  `getHomeMeta(locale).title` in the layout, so each locale gets its own.
- `robots` is defined on the content pages (`app/[locale]/page.tsx`,
  `app/[locale]/[page]/page.tsx`), **not** on `app/[locale]/layout.tsx`. A
  layout's metadata is inherited by the 404 boundary too, which produced two
  conflicting `<meta name="robots">` tags on error pages.

There may be naming differences between the code and the documents: the plan
document describes the original design decisions along the way, while the
implementation contains today's version of those decisions. The code is always
what determines the correct behavior.
