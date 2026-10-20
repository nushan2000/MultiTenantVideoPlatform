import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { getUser } from "@/lib/access";

export default async function MarketingHome() {
  const user = await getUser();
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <JsonLd data={[{ "@context": "https://schema.org", "@type": "WebSite", name: "VideoPlatform", url: process.env.APP_URL ?? "http://localhost:3000" }, { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "VideoPlatform", applicationCategory: "MultimediaApplication", offers: [{ "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" }] }]} />
      <h1 className="text-4xl font-bold">Your own video website, in minutes.</h1>
      <p className="mt-4 text-neutral-600">
        Create a site from a template, upload videos or import them from a link, and publish on a free subdomain, or on your own domain with Premium.
      </p>
      <div className="mt-8 flex gap-3">
        {user ? (
          <Link className="rounded-md bg-blue-600 px-4 py-2 text-white" href="/dashboard">Go to dashboard</Link>
        ) : (
          <>
            <Link className="rounded-md bg-blue-600 px-4 py-2 text-white" href="/register">Get started</Link>
            <Link className="rounded-md border px-4 py-2" href="/login">Sign in</Link>
          </>
        )}
      </div>
      <section className="mt-16 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border p-5"><h2 className="font-semibold">Free</h2><p className="mt-2 text-sm text-neutral-600">Subdomain, 5 GB, up to 720p, platform ads, 100 videos.</p></div>
        <div className="rounded-lg border p-5"><h2 className="font-semibold">Premium</h2><p className="mt-2 text-sm text-neutral-600">Custom domain, 200 GB, up to 1080p, your own ads, custom theme and CSS, no badge.</p></div>
      </section>
    </main>
  );
}
