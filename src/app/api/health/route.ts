import { NextResponse } from "next/server";
import { platformDb } from "@/lib/db/client";
import { redis } from "@/lib/redis";
import { headObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};
  try {
    await platformDb.plan.count();
    checks.postgres = "ok";
  } catch {
    checks.postgres = "fail";
  }
  try {
    await (await redis()).ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "fail";
  }
  try {
    await headObject("health-check"); // 404 is fine: it proves the store answers
    checks.storage = "ok";
  } catch {
    checks.storage = "fail";
  }
  const healthy = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503 });
}
