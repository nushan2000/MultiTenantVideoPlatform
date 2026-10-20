"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { audit } from "@/lib/audit";
import { platformDb } from "@/lib/db/client";
import { clientIp, rateLimit, RateLimitError } from "@/lib/rate-limit";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  name: z.string().trim().min(1, "Enter your name").max(100),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  terms: z.literal("on", { error: "You must accept the Terms and Acceptable Use Policy" }),
});

const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);

export async function registerAction(formData: FormData) {
  const ip = clientIp(await headers());
  try {
    await rateLimit(`register:ip:${ip}`, 5, 3600);
  } catch (e) {
    if (e instanceof RateLimitError) fail("/register", "Too many sign-ups from your network. Try again later.");
    throw e;
  }
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("/register", parsed.error.issues[0].message);
  const { email, name, password } = parsed.data;

  if (await platformDb.user.findUnique({ where: { email } })) return fail("/register", "An account with this email already exists");
  const user = await platformDb.user.create({
    // Terms/AUP acceptance is recorded with a timestamp at signup.
    data: { email, name, passwordHash: await bcrypt.hash(password, 12), termsAcceptedAt: new Date() },
  });
  await audit({ action: "user.registered", userId: user.id, ip, metadata: { termsAccepted: true } });
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
}

export async function loginAction(formData: FormData) {
  const ip = clientIp(await headers());
  try {
    await rateLimit(`login:ip:${ip}`, 30, 15 * 60);
    await signIn("credentials", { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? ""), redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof RateLimitError) return fail("/login", "Too many attempts. Try again later.");
    if (e instanceof AuthError) return fail("/login", "Invalid email or password");
    throw e; // NEXT_REDIRECT
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
