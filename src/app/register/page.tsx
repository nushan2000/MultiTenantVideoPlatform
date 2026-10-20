import Link from "next/link";
import { registerAction } from "@/app/actions/auth";
import { Card, Field, Flash, btnCls, inputCls } from "@/components/ui";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create your account", description: "Create a free video website in minutes: upload or import videos, pick a template, publish on your own subdomain or domain.", alternates: { canonical: "/register" } };

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
      <Flash error={error} />
      <Card>
        <form action={registerAction}>
          <Field label="Name"><input className={inputCls} name="name" required maxLength={100} autoComplete="name" /></Field>
          <Field label="Email"><input className={inputCls} name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password" hint="At least 10 characters"><input className={inputCls} name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
          <label className="mb-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="terms" required className="mt-1" />
            <span>I accept the <Link className="underline" href="/terms">Terms of Service</Link> and <Link className="underline" href="/aup">Acceptable Use Policy</Link>, and confirm I will only upload content I have the rights to.</span>
          </label>
          <button className={btnCls}>Create account</button>
        </form>
      </Card>
      <p className="text-sm text-neutral-600">Already registered? <Link className="text-blue-600 underline" href="/login">Sign in</Link></p>
    </main>
  );
}
