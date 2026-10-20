import { z } from "zod";

const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  // Hostname only, no port: "localhost" in dev, "platform.com" in prod.
  PLATFORM_ROOT_DOMAIN: z.string().min(1).regex(/^[a-z0-9.-]+$/, "hostname only, lowercase, no port"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  AUTH_SECRET: z.string().min(16),
  INTERNAL_TOKEN: z.string().min(8),
  S3_ENDPOINT: optionalUrl,
  S3_PUBLIC_ENDPOINT: optionalUrl, // browser-reachable URL of the same store (defaults to S3_ENDPOINT)
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("videos"),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  PLATFORM_VAST_TAG_URL: optionalUrl,
  PLATFORM_ADULT_VAST_TAG_URL: optionalUrl,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PREMIUM: optional,
  CNAME_TARGET: optional, // default: cname.<root>
  FFMPEG_PATH: optional,
  FFPROBE_PATH: optional,
  IMPORT_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  TRANSCODE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Lazy so `next build` doesn't need runtime secrets. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
      throw new Error(`Invalid environment:\n  ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const cnameTarget = () => getEnv().CNAME_TARGET ?? `cname.${getEnv().PLATFORM_ROOT_DOMAIN}`;
