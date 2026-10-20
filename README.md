# Multi-tenant video hosting platform

Shopify-style: people register, create a video site from a template, and publish it on a free subdomain or (Premium) their own domain.
Everything runs on your own server: Postgres, Redis, S3-compatible storage (MinIO), FFmpeg workers, Caddy. **No Docker, no cloud services.**

Status: all 7 phases implemented. See [ARCHITECTURE.md](ARCHITECTURE.md) for design, [docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md) for putting it on a VPS.

## Local development (no Docker)

Requirements: Node 20+ (22 recommended), pnpm 9.

```bash
pnpm install
cp .env.example .env              # defaults work as-is for local dev

pnpm infra                        # terminal 1, keep running: Postgres :5433, Redis :6390, S3 emulator :9100
pnpm db:generate && pnpm db:deploy
pnpm seed                         # 2 tenants, 6 sample videos (processed by the real FFmpeg pipeline), admin user

pnpm dev                          # terminal 2: http://localhost:3000
pnpm worker:transcode             # terminal 3: FFmpeg HLS worker
pnpm worker:import                # terminal 4: URL-import worker
pnpm worker:maintenance           # terminal 5: domain verification + 24 h upload cleanup
```

`pnpm infra` uses portable binaries inside the project (`embedded-postgres` npm package, a Redis build in `.data/redis-dl`, and the
`s3rver` S3 emulator). Redis there is 5.0, which BullMQ warns about; production should use Redis 6.2+.
If a port is taken by another project, set `POSTGRES_PORT` / `DEV_REDIS_PORT` / `DEV_S3_PORT` and the matching URLs in `.env`.

Subdomains work out of the box in dev (`*.localhost` resolves to loopback in browsers):

| URL | What |
|---|---|
| `http://localhost:3000` | marketing, sign-up, dashboard (`/dashboard`), admin (`/admin`) |
| `http://demo-free.localhost:3000` | seeded Free tenant storefront |
| `http://demo-premium.localhost:3000` | seeded Premium tenant storefront |

Seed accounts (password `password1234`): `free@example.com`, `premium@example.com`, `admin@example.com` (super admin).
With no Stripe keys, **Plan & billing** shows a dev-only switcher (hidden when `NODE_ENV=production`) to flip Free/Premium.

## Tests

```bash
pnpm infra        # integration tests need the local infra running
                  # stop the workers first: a running import/transcode worker would consume the jobs the tests enqueue
pnpm test         # unit + integration (tenant isolation, SSRF, import, pipeline, entitlements, domains, ads, billing)
pnpm typecheck
```

| Suite | Proves |
|---|---|
| `isolation.test.ts` | tenant A cannot read/write tenant B's data via the Prisma wrapper **and** via raw SQL (RLS only) |
| `ssrf.test.ts` | localhost, 169.254.169.254, decimal/hex/octal IPs, IPv6-mapped IPv4, private-resolving DNS names, bad schemes/ports/credentials |
| `import-download.test.ts` | mocked slow, oversized (declared and streamed), redirecting, redirect-to-internal, non-video, 4xx/5xx servers |
| `pipeline.test.ts` | direct multipart upload to storage, real FFmpeg HLS transcode, quota reservation under concurrency, URL import to READY |
| `entitlements.test.ts` | Free/Premium limits |
| `seo.test.ts` | SEO schemas/sanitisation, URL-handle rules, redirect history, per-tenant handle resolution, health scoring |
| `platform.test.ts` | custom-domain lifecycle + downgrade, Caddy `ask` approval, ad rules, CSS validation, Stripe webhooks |

## Layout

```
src/app/            Next.js: marketing, /dashboard, /admin, /api/*, /sites/[host]/* (storefront, reached via middleware rewrite)
src/lib/            db (tenant wrapper + RLS), entitlements, ssrf, import, ingest, transcode, quota, domains, ads, billing, safety
src/templates/      storefront templates + registry (classic-grid)
src/workers/        transcode, import, maintenance (separate Node processes)
prisma/             schema + migrations (incl. RLS)
scripts/            dev-infra (local services), seed
```

## Before production

- A real CSAM / moderation provider behind `ContentScanner` (`src/lib/safety/scanner.ts` ships a stub that approves everything).
- Legal review: adult content, uploader identity and record-keeping duties (e.g. 18 U.S.C. 2257-style rules), the Terms/AUP templates.
- A payment processor that allows your content type (adult tenants currently have **no** processor by design).
