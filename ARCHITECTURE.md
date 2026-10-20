# Architecture

One Next.js 15 app serves the platform site, tenant dashboard, super-admin and every tenant storefront. Three Node worker processes
do the heavy lifting. Everything self-hosted: PostgreSQL, Redis, MinIO (S3 API), Caddy.

```
browser ──► Caddy (TLS, on-demand certs) ──► Next.js (web)
                                              │   ├─ platform host:  marketing, /dashboard, /admin, /api/*
                                              │   └─ tenant host:    rewrite → /sites/{host}/…  (storefront)
browser ──presigned PUT──► MinIO (S3 API) ◄── workers
                       Postgres (RLS)   Redis (cache, rate limits, BullMQ)
workers: transcode (FFmpeg→HLS) · import (URL download) · maintenance (domain DNS, 24h upload sweep)
```

## Tenancy

- **Shared DB, shared schema.** Tenant-owned tables carry `tenantId` (`Tenant` is keyed by `id`).
- **Layer 1: Prisma wrapper** (`src/lib/db/scoped.ts`). `tenantDb(tenantId)` injects `tenantId` into every `where`/`data` and runs each
  query in a transaction that first does `set_config('app.tenant_id', …, true)` (= `SET LOCAL`). `tenantTx()` gives an interactive
  transaction with the same context for multi-statement work (quota math).
- **Layer 2: Postgres RLS** (`prisma/migrations/*_rls`). `FORCE`d policies on every tenant table via `app_tenant_matches()`. No context =
  no rows (fail closed). The app connects as `app_user` (NOSUPERUSER, NOBYPASSRLS); migrations run as the owner (`DIRECT_URL`).
- **Platform context** `platformDb` sets `app.bypass_rls` for host resolution, auth, admin, workers and webhooks. Grep-able by design.
- Cross-tenant tests live in `tests/isolation.test.ts` and refuse to run as a superuser.

### Host resolution
`src/middleware.ts` (Edge, pure) classifies the Host header: platform / `{slug}.root` / custom domain / invalid (reserved slugs, nested
subdomains → 404). Tenant hosts are rewritten to `/sites/{host}/…`; `/sites/*` cannot be typed directly; only `/api/media/*` and
`/api/public/*` are reachable on tenant hosts; `/dashboard`, `/admin`, `/login` are 404 there. `src/lib/tenancy/resolve.ts` maps host → tenant
(subdomain slug, or VERIFIED/ACTIVE `CustomDomain`) with a 60 s Redis cache (5 s negative) and explicit invalidation on any change.
Sessions are host-scoped cookies on the platform host only.

## Plans & entitlements
`src/lib/entitlements.ts` is the only place plan rules exist (`PLAN_CONFIG`). Enforced server-side at: upload-init, URL import,
custom-domain creation, ad config, theme/CSS saves; UI only reflects `entitlements()`. Restricting URL import to Premium =
`canUseUrlImport: false` on the free row. **Downgrade** (`applyPlanChange`): custom domains → `PENDING` (deactivated, site falls back
to its subdomain, rows kept), content kept, ads/CSS/theme gated at render time, uploads/imports blocked by quota.
Billing: `BillingProvider` interface; Stripe Checkout + signed webhook implemented; adult tenants get **no** provider until a high-risk
processor is registered in `src/lib/billing/index.ts`.

## Video pipeline (two ingest methods, one shared path)

`IngestMethod` (`src/lib/ingest/types.ts`): `DIRECT` and `URL` implement `start()`; both end in `finalizeIngest()` → status
`PROCESSING` → one BullMQ transcode job. Adding a third method = implement the interface + register it.

**A. Direct:** `init` (plan checks, quota reserve, S3 multipart create) → browser PUTs 8 MB parts straight to storage (3 parallel, per-part
retry, resumable via stored parts) → `complete` (verifies parts + total size, completes multipart, `HEAD` size check) → transcode.
**B. URL:** `POST /api/videos/import` (single or batch; entitlement, rights checkbox + timestamp, syntax guard, quota) → queue
`video-import` → import worker: SSRF-guarded HEAD, streaming GET into S3 multipart (bounded memory), ≤3 redirects re-guarded, size limit enforced
while streaming, hard timeout (30 min) + minimum-throughput watchdog, progress in Redis, exponential-backoff retry for transient errors only.
Per-tenant concurrency cap comes from the plan. Direct links only; `RemoteSourceResolver` exists with no implementations.
**Shared:** ffprobe validate → `ContentScanner` hook → plan-limited renditions (360/720/1080 ≤ source) → HLS + thumbnail → upload → settle quota
+ `READY` in one transaction. Idempotent, 4 attempts with backoff, dead-letter queue.

**Quota:** `Video.sizeBytes` is the reservation while a video is not READY and the real size afterwards; `StorageUsage.bytesReserved/Used`
move under a row lock (`src/lib/quota.ts`). Invariant (checked in tests): `reserved == Σ in-flight sizes`, `used == Σ READY sizes`.

**Playback:** `/api/media/*` streams from storage with access rules (READY only; PUBLIC/UNLISTED public, PRIVATE for members; `source.*` never).
Put a CDN in front of the same path when needed.

### SSRF defence (`src/lib/ssrf.ts`, `src/lib/import/download.ts`)
http/https only, ports 80/443, no credentials, own-domain/own-storage block, `localhost`/`.internal`/`.local` rejected, IPs must be global unicast
(IPv4+IPv6, IPv4-mapped unwrapped, decimal/hex/octal forms normalised by the URL parser), **DNS resolved in our own `lookup`** and the socket
connects to the address we validated (rebinding-safe), every redirect hop re-validated, mixed public+private DNS answers refused.

## Custom domains (Premium)
Add → `CustomDomain(PENDING)` + TXT token → instructions (CNAME to `cname.<root>`, TXT `_platform-verify`) → maintenance worker checks DNS every
60 s → `VERIFIED` → HTTPS probe triggers Caddy's on-demand cert → `ACTIVE`. `GET /api/internal/domain-check?token=…&domain=…` is Caddy's `ask`
endpoint: approves only the platform hosts, existing tenant subdomains, and verified domains of active, entitled tenants. Domains of the
platform or already claimed are refused.

## SEO (Shopify-style, per page)

**Editing is client-side, rendering is server-side.** Owners edit SEO in context with a "Search engine listing" card (live Google-style preview,
page title, meta description, URL handle, advanced: keywords / share image / canonical / noindex) that saves through small JSON APIs with no page
reload. The tags themselves are always rendered on the server, because crawlers do not reliably execute JavaScript.

Where it lives in the dashboard: **SEO tab** (health score + checklist, home page listing, a filterable list of *every* page with in-place editing and
"Needs attention", site-wide settings) and the same card inside each **video** (Videos → Edit / "SEO" button) and **category** (Settings → "Edit SEO & URL").
Deep links: `/dashboard/<site>/seo#video-<id>`, `/dashboard/<site>/videos?edit=<id>&seo=1`.

| Level | Stored in | Editable |
|---|---|---|
| Site-wide + home | `Tenant.seo` | title template (`%s`), home title/description, keywords, brand name, locale, X handle, Google/Bing verification, social profiles, share image, favicon |
| Category | `Category.seo` + `slug` | title, description, URL handle, keywords, share image, canonical, noindex |
| Video | `Video.seo` | same as category |

(`seo` is a JSON column on each; additive migration `*_seo_metadata`.) Everything is sanitised/validated (`src/lib/seo.ts`): tags stripped, length limits, https-only
URLs, locale/handle formats. Fallbacks are automatic (title = name, description = first 155 chars of the description), so an untouched site is still optimised.

**URL handles + redirects:** `/v/<handle>` and `/c/<handle>`. Changing a handle remembers the old one in `seo.previousHandles`; old handles and raw ids answer
**308** to the canonical URL, handles are unique per tenant (current and retired), and id-shaped handles are rejected so a handle can never shadow an id.

**Always emitted per page** (`buildPageMetadata`): title (with the site template), description, keywords, canonical (custom domain once ACTIVE), robots
(+ `max-image-preview`/`max-video-preview`/`max-snippet`), Open Graph, Twitter card, verification tags, `lang`. Structured data: `WebSite`+`SearchAction`,
`Organization`, `VideoObject` (duration, thumbnail, embedUrl, views), `BreadcrumbList`, `CollectionPage`. Sitemap with Google **video** and **image** extensions
(lists only indexable PUBLIC+READY pages; excludes noindex and canonical-elsewhere), `robots.txt` (blocks /api, /search, /embed; media stays crawlable),
an embeddable `/embed/<id>` player (noindex, the only framable route) used as `video:player_loc`, internal search is `noindex,follow`, a site-wide noindex always wins,
platform pages have their own sitemap/robots/JSON-LD and the dashboard/admin are noindex.

## Storefront structure (YouTube-style) and pages

**Navigation:** header (logo, search, Home / Trending / Categories / About), category chips on home and lists, a four-column footer (Explore, Help, Legal, More), breadcrumbs,
a skip link, a branded 404 and an HTML `/sitemap`. **Routes:** `/`, `/trending`, `/categories`, `/c/<handle>`, `/tag/<tag>`, `/search`, `/v/<handle>`, `/embed/<id>`, `/<page-slug>`.
Lists are paginated (`?page=N`, 24 per page) with real `<a>` links; `rel=prev/next` and the self-canonical for page 2+ are emitted as `<link>` tags by `PaginationHead`
(Next's metadata API would strip `?page=N`).

**Watch page:** player with captions (`<track>`), chapters (click to seek, `?t=` deep links), Share/Embed (copy link, embed code, social), expandable description (full text always in the HTML),
tags, transcript, related videos by shared tag/category, report form.

**Pages (`Page` table + `Tenant.profile`).** Every site gets the sections a video site is expected to have as *generated defaults*: About, Contact, FAQ, Privacy Policy, Terms of Service,
Copyright/DMCA, Cookie Policy, Community Guidelines, and for adult sites 18 U.S.C. 2257 and Parental Controls. Text is generated from the owner's *Business details* (legal name, email, address,
DMCA agent, 2257 custodian) and degrades gracefully when empty. Owners can edit any of them (a row overrides the default; delete = reset), hide the optional ones, and create unlimited custom pages
(Markdown, sanitised on render, live preview, own search listing, 50 max). Privacy, Terms, DMCA, Cookies, Contact (and 2257 / Parental) are **mandatory**: editable but never hidden.
Custom slugs cannot collide with routes or system slugs. Legal/help pages stay readable *before* the age gate. The platform's own marketing site has the same set (`/about /contact /privacy /dmca /cookies /terms /aup`).
These are templates, not legal advice; the dashboard says so.

### SEO completions (technical)
- **Sitemaps:** `/sitemap.xml` is an index -> `/sitemaps/main.xml` (home, sections, categories, tags with 2+ videos, published pages) + `/sitemaps/videos-N.xml` (1,000 videos each, Google video + image extensions, tags, category). `lastmod` is reliable because view counting no longer touches `updatedAt`.
- **IndexNow** on video ready / edit / page change (`INDEXNOW_KEY`); key file served on every host. **RSS/MRSS** `/feed.xml`; **web manifest** + `theme-color` + apple icon per site.
- **Video rich results:** `VideoObject` with `contentUrl` (HLS), 1280px thumbnails (`thumb-lg.jpg`, also `og:image` and the player poster, preloaded for LCP), `transcript`, `caption`, `hasPart` Clips from chapters, `embedUrl`, view count.
- **Text for search engines:** captions (WebVTT/SRT upload), transcript, chapters, tags (+ `/tag/<tag>` pages, noindex when thin), better default titles from filenames.
- **Crawl hygiene:** robots.txt blocks `/api`, `/search`, `/embed` and HLS; `X-Robots-Tag: noindex` on HLS files; internal search is `noindex,follow`; unlisted/noindex pages are left out of sitemaps; HSTS in production.
- **Canonicalisation:** the free subdomain 308-redirects to an ACTIVE custom domain (path + query kept); one canonical origin everywhere.
- **Age gate vs indexing:** verified search-engine crawlers (forward-confirmed reverse DNS, not just a User-Agent) may read gated content when the owner leaves *crawler access* on (default); spoofed crawlers stay gated.
- **Owner controls:** custom `<meta>` tags and JSON-LD per page/site (validated, platform-managed names refused, scripts can't run), bulk title/description editing via CSV export/import, duplicate-title detection, social-card preview, theme contrast check (WCAG 4.5:1 text, 3:1 accent).

## Trust & safety
Terms/AUP acceptance stored at signup; per-tenant `contentCategory`. Adult tenants: mandatory age-gate (enforced in every page, not just the
layout, because Next streams page payloads), RTA meta, optional noindex, ad networks that disallow adult content blocked. Abuse/DMCA form on every
watch page → `Report` → tenant inbox + platform queue; takedown sets `BLOCKED`. `ContentScanner` hook runs before any video can be READY (stub today).
Super-admin: suspend tenant, block video, report queue, audit log. `AuditLog` records imports, domain/plan/ads/admin actions.
Rate limits (Redis, fail-open): login, register, upload-init, import, report, slug check. CSRF: Auth.js tokens + same-origin check on JSON APIs.
Storefront CSP + `nosniff`; tenant ad HTML is sanitised (no scripts, sandboxed iframes); custom CSS is allow-list validated.

## Known gaps / follow-ups
- **SEO**: page language comes from the site locale only; no hreflang/multi-language; no manual redirect manager (redirects are created when a handle changes); deleted videos return 404 not 410; automatic transcription (Whisper) and Search Console API integration are not built (owners can upload captions/transcripts and verify via meta tag); a streaming 404 is delivered through the client payload (status + noindex are correct).
- **Contact page** shows the owner's email/address; there is no built-in contact form (needs a mail service).
- **Comments and likes**: toggles exist but no tables (needs a data-model addition: ask first). **Downloads**: toggle forced off.
- **Import worker network isolation**: the worker reads Postgres/Redis directly, so it cannot be fully cut off from them. The SSRF guard is the main
  defence; add firewall rules (see docs/DEPLOY-VPS.md). A stricter design has the worker call an internal API instead of the DB.
- **CSP** is static (`'unsafe-inline'` scripts because of Next's bootstrap); per-tenant/nonce CSP is a follow-up.
- Reservation covers the source size; HLS renditions add ~15-60% on top, which settles as real usage (a tenant can briefly overshoot its limit by that).
- `/api/media` hits the DB per request; cache the visibility lookup or serve via CDN signed URLs at scale.
- The scanner is a stub; no virus scan beyond ffprobe validation.

## Scaling roadmap
1. **Now (single VPS):** everything on one box; storage on local disk via MinIO; workers as systemd services.
2. **Split roles:** move Postgres to its own host (or managed), storage to a separate MinIO node/volume; add Redis persistence (AOF).
3. **CDN** in front of `/api/media` (HLS is cache-friendly); signed URLs for PRIVATE videos.
4. **Workers scale out:** run N transcode workers on separate machines (stateless; concurrency per CPU); GPU encoding if needed;
   a second import worker box with strict egress rules.
5. **Web scale-out:** several Next.js instances behind Caddy; Redis is already shared state; add Postgres read replicas for storefront reads.
6. **Large tenants:** per-tenant rate limits and quotas on bandwidth; shard tenants across database clusters (RLS makes this a routing decision).
7. **Storage growth:** MinIO distributed mode, or move to R2/S3 (the code only uses the S3 API); lifecycle rules for old renditions.
