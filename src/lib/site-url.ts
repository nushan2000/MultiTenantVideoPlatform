import { getEnv } from "./env";

/** Public URL of a tenant's free subdomain site (dev: http://acme.localhost:3000). */
export function siteUrl(slug: string): string {
  const env = getEnv();
  const app = new URL(env.APP_URL);
  const port = app.port ? `:${app.port}` : "";
  return `${app.protocol}//${slug}.${env.PLATFORM_ROOT_DOMAIN}${port}`;
}
