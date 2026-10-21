# Deploying on your own VPS (no Docker)

Reference setup: Ubuntu 22.04/24.04, everything on one machine. Adjust names/paths. Replace `example.com` with your platform domain.

## 1. Packages
```bash
sudo apt install -y postgresql redis-server caddy ffmpeg nodejs  # Node 22: use NodeSource or nvm; Redis must be >= 6.2
corepack enable && corepack prepare pnpm@9 --activate
```
`ffmpeg`: either system packages (set `FFMPEG_PATH=/usr/bin/ffmpeg`, `FFPROBE_PATH=/usr/bin/ffprobe`) or the bundled npm binaries.

## 2. PostgreSQL (RLS requires two roles)
```sql
CREATE ROLE platform LOGIN PASSWORD '<strong>' ;            -- schema owner, used for migrations only
CREATE DATABASE platform OWNER platform;
CREATE ROLE app_user LOGIN PASSWORD '<strong>' NOSUPERUSER NOBYPASSRLS;  -- the app connects as this
\c platform
GRANT USAGE ON SCHEMA public TO app_user;
```
`.env`: `DATABASE_URL=postgresql://app_user:…@127.0.0.1:5432/platform`, `DIRECT_URL=postgresql://platform:…@127.0.0.1:5432/platform`.
Run `pnpm db:deploy` (migrations grant `app_user` its table privileges). Never point `DATABASE_URL` at a superuser: RLS would be bypassed.

## 3. Redis
`bind 127.0.0.1`, `requirepass`, `appendonly yes` (queues survive restarts). `REDIS_URL=redis://:password@127.0.0.1:6379`.

## 4. Storage on this VPS: MinIO
Install the MinIO server binary, run it as a systemd service with a data dir on a disk with room for your videos
(`MINIO_ROOT_USER/PASSWORD`, `--address 127.0.0.1:9000`). Create bucket `videos` (private) and set bucket CORS so browsers can upload parts directly
and the app can read the ETag:
```json
[{"AllowedOrigins":["https://example.com"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]
```
Expose it at `https://s3.example.com` through Caddy (see below) and set:
```
S3_ENDPOINT=http://127.0.0.1:9000          # server-side, loopback
S3_PUBLIC_ENDPOINT=https://s3.example.com  # only used to SIGN browser upload URLs
S3_BUCKET=videos  S3_FORCE_PATH_STYLE=true  S3_ACCESS_KEY=…  S3_SECRET_KEY=…
```
Back up the data directory and Postgres; MinIO has no replication in single-node mode.

## 5. App
```bash
git clone … /srv/videoplatform && cd /srv/videoplatform
cp .env.example .env   # fill in: PLATFORM_ROOT_DOMAIN=example.com, APP_URL=https://example.com, AUTH_SECRET (openssl rand -base64 32),
                       # INTERNAL_TOKEN (openssl rand -hex 24), DB/Redis/S3, Stripe keys, PLATFORM_VAST_TAG_URL, PLATFORM_IPS (this server's IPs)
pnpm install --frozen-lockfile && pnpm db:generate && pnpm db:deploy && pnpm build
```
Run four systemd services (`User=videoplatform`, `WorkingDirectory=/srv/videoplatform`, `EnvironmentFile=/srv/videoplatform/.env`, `Restart=always`):

| Unit | ExecStart |
|---|---|
| `vp-web` | `/usr/bin/pnpm start` (`PORT=3000`; bind to loopback with `HOSTNAME=127.0.0.1`) |
| `vp-transcode` | `/usr/bin/pnpm worker:transcode` |
| `vp-import` | `/usr/bin/pnpm worker:import` (run as its **own user**, see §7) |
| `vp-maintenance` | `/usr/bin/pnpm worker:maintenance` |

## 6. Caddy (TLS + on-demand certificates for custom domains)
DNS: `example.com`, `*.example.com`, `cname.example.com` and `s3.example.com` → this server. Tenants point their domain's CNAME at `cname.example.com`.
```caddyfile
{
	email you@example.com
	on_demand_tls {
		# only verified custom domains / existing tenants get certificates; keep this URL on loopback
		ask http://127.0.0.1:3000/api/internal/domain-check?token=<INTERNAL_TOKEN>
	}
}

s3.example.com {
	reverse_proxy 127.0.0.1:9000
}

# platform + tenant subdomains + any verified custom domain
https:// {
	tls {
		on_demand
	}
	encode zstd gzip   # compression: faster pages (Core Web Vitals) and less bandwidth
	reverse_proxy 127.0.0.1:3000 {
		header_up X-Forwarded-Proto https
	}
}
http:// {
	redir https://{host}{uri}
}
```
(Wildcard certificates for `*.example.com` via a DNS-challenge plugin are an alternative to on-demand certs for subdomains.)
Never expose port 3000, 5432, 6379 or 9000 publicly: firewall everything except 22/80/443.

## 7. Import worker isolation (SSRF defence in depth)
Run `vp-import` as a dedicated user (`importer`) and restrict its egress with nftables, allowing only what it needs:
```
table inet importer {
  chain out {
    type filter hook output priority 0; policy accept;
    meta skuid "importer" ip daddr 127.0.0.1 tcp dport { 5432, 6379, 9000 } accept   # postgres, redis, minio
    meta skuid "importer" udp dport 53 accept
    meta skuid "importer" ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 100.64.0.0/10, 127.0.0.0/8 } drop
    meta skuid "importer" ip6 daddr { ::1, fc00::/7, fe80::/10 } drop
  }
}
```
This sits behind the in-code guard (resolution pinning, per-hop validation); if you also block cloud-metadata addresses at the host level, a guard bug is not exploitable.

## 8. SEO operations
- **IndexNow:** set `INDEXNOW_KEY` (any 8-128 chars of `A-Za-z0-9-`). Every site then serves `/<key>.txt` and pings Bing/Yandex when a video goes live or a page changes.
- **Search Console / Bing Webmaster:** owners paste their verification code in *Dashboard → SEO* and submit `https://<site>/sitemap.xml`.
- **Public Suffix List:** apply to add your platform domain to <https://publicsuffix.org/> so `*.yourplatform.com` tenants are treated as separate sites by browsers and search engines (protects tenants from each other's reputation).
- **Policy for new free sites:** consider `noindex` until reviewed if you expect spam. Adult tenants are better on a separate domain.
- **Caching:** HTML is dynamic. Put a CDN in front of `/api/media/*` (immutable media) first; add HTML caching only with a short TTL.

## 9. Content scanning, captions, bandwidth
- **Malware scan (ClamAV, free):** `apt install clamav-daemon`, then in `/etc/clamav/clamd.conf` set `TCPSocket 3310`, `TCPAddr 127.0.0.1` and `StreamMaxLength 5G` (default 25M makes big videos "too large" and they are held for review). Put `CLAMD_HOST=127.0.0.1` in `.env`.
- **Moderation / hash matching (CSAM etc.):** these need a provider you contract (PhotoDNA, Google CSAI Match, a moderation API...). Point `SCAN_WEBHOOK_URL` at a small endpoint of yours that calls it; contract in `src/lib/safety/providers.ts`. Both scanners can run together (first non-clean verdict wins).
- **Fail closed:** set `SCANNER_REQUIRED=true` in production so no video is ever published while no scanner is configured.
- **Automatic captions (Premium, optional):** install whisper.cpp and a model on the VPS, then e.g. `WHISPER_COMMAND=/opt/whisper/whisper-cli -m /opt/whisper/ggml-base.bin -f {input} -ovtt -of {output}`. It runs in the transcode worker after a video is already live. CPU-heavy: keep `TRANSCODE_WORKER_CONCURRENCY=1` on a small box.
- **Bandwidth:** each tenant's monthly bytes are counted in Redis and saved to Postgres every minute by the maintenance worker. Limits are in `PLAN_CONFIG` (`bandwidthLimitBytes`). Behind a CDN only cache misses reach the origin, so use CDN logs for exact billing and treat this as a safety net.
- **Scheduled publishing** and the bandwidth flush run in `vp-maintenance`: keep that service running.

## 10. Operations
- Health: `GET http://127.0.0.1:3000/api/health` (Postgres, Redis, storage).
- Logs are structured JSON (pino) on stdout → `journalctl -u vp-web -o cat`.
- Dead-letter jobs: BullMQ queue `video-dead-letter` (inspect with any BullMQ dashboard).
- First admin: `UPDATE "User" SET "isSuperAdmin" = true WHERE email = '…';`
- Stripe: set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PREMIUM`, `STRIPE_WEBHOOK_SECRET`; webhook endpoint `https://example.com/api/billing/webhook`
  (events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`).
