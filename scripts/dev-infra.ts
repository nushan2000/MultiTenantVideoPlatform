// Local infrastructure WITHOUT Docker. Runs until Ctrl+C:
//  - Postgres  (embedded-postgres npm package)          :5433
//  - Redis     (portable Windows build in .data/redis-dl; or `redis-server` on PATH)  :6390
//  - S3        (s3rver, an S3-compatible emulator)       :9100
// DEV ONLY passwords. Production uses managed Postgres/Redis and R2/S3.
import EmbeddedPostgres from "embedded-postgres";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import pg from "pg";
import S3rver from "s3rver";

const PG_PORT = Number(process.env.POSTGRES_PORT ?? 5433);
const REDIS_PORT = Number(process.env.DEV_REDIS_PORT ?? 6390);
const S3_PORT = Number(process.env.DEV_S3_PORT ?? 9100);
const DATA = ".data/pg";

const cors = `<CORSConfiguration><CORSRule>
<AllowedOrigin>*</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>
<AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader></CORSRule></CORSConfiguration>`;

const postgres = new EmbeddedPostgres({ databaseDir: DATA, user: "platform", password: "platform_dev_password", port: PG_PORT, persistent: true });
let redis: ChildProcess | undefined;
let s3: any;

async function startPostgres() {
  if (!existsSync(`${DATA}/PG_VERSION`)) await postgres.initialise();
  await postgres.start();
  const conn = (database: string) => new pg.Client({ host: "localhost", port: PG_PORT, user: "platform", password: "platform_dev_password", database });
  const admin = conn("postgres");
  await admin.connect();
  if ((await admin.query("SELECT 1 FROM pg_database WHERE datname='platform'")).rowCount === 0) await admin.query("CREATE DATABASE platform");
  if ((await admin.query("SELECT 1 FROM pg_roles WHERE rolname='app_user'")).rowCount === 0) {
    await admin.query("CREATE ROLE app_user LOGIN PASSWORD 'app_dev_password' NOSUPERUSER NOBYPASSRLS");
  }
  await admin.query("GRANT CONNECT ON DATABASE platform TO app_user");
  await admin.end();
  const owner = conn("platform");
  await owner.connect();
  await owner.query("GRANT USAGE ON SCHEMA public TO app_user");
  await owner.end();
  console.log(`postgres  ready :${PG_PORT}`);
}

function startRedis() {
  const exe = existsSync(".data/redis-dl/redis-server.exe") ? ".data/redis-dl/redis-server.exe" : "redis-server";
  mkdirSync(".data/redis", { recursive: true });
  redis = spawn(exe, ["--port", String(REDIS_PORT), "--bind", "127.0.0.1", "--dir", ".data/redis", "--save", ""], { stdio: "ignore" });
  redis.on("error", (e) => console.error("redis failed to start:", e.message));
  console.log(`redis     ready :${REDIS_PORT}`);
}

async function startS3() {
  mkdirSync(".data/s3", { recursive: true });
  s3 = new S3rver({
    port: S3_PORT, address: "127.0.0.1", silent: true, directory: ".data/s3",
    configureBuckets: [{ name: "videos", configs: [cors] }],
  });
  await s3.run();
  console.log(`s3        ready :${S3_PORT} (bucket "videos")`);
}

async function stop() {
  redis?.kill();
  await s3?.close().catch(() => {});
  await postgres.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

(async () => {
  await startPostgres();
  startRedis();
  await startS3();
  console.log("infra up. Ctrl+C to stop.");
})().catch(async (e) => { console.error(e); await stop(); });
