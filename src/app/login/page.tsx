import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { Card, Field, Flash, btnCls, inputCls } from "@/components/ui";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: true } };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Sign in</h1>
      <Flash error={error} />
      <Card>
        <form action={loginAction}>
          <Field label="Email"><input className={inputCls} name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password"><input className={inputCls} name="password" type="password" required autoComplete="current-password" /></Field>
          <button className={btnCls}>Sign in</button>
        </form>
      </Card>
      <p className="text-sm text-neutral-600">No account? <Link className="text-blue-600 underline" href="/register">Create one</Link></p>
    </main>
  );
}
