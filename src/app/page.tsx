import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PlatformFooter from "@/components/PlatformFooter";
import { getUser } from "@/lib/access";

export default async function MarketingHome() {
  const user = await getUser();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/30">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3.586l4.293 2.146A1 1 0 0021 16.67V7.33a1 1 0 00-1.407-.894L16 8.586V7a2 2 0 00-2-2H4z" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-neutral-900">
              Video<span className="text-blue-600">Platform</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-blue-500 hover:to-blue-600 transition-all"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 hover:from-blue-500 hover:to-blue-600 transition-all"
                >
                  Get started free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
        <JsonLd
          data={[
            { "@context": "https://schema.org", "@type": "WebSite", name: "VideoPlatform", url: process.env.APP_URL ?? "http://localhost:3000" },
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "VideoPlatform",
              applicationCategory: "MultimediaApplication",
              offers: [{ "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" }],
            },
          ]}
        />

        {/* Hero Section */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-4 py-1.5 text-xs font-semibold text-blue-700 shadow-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Next-Gen Multi-Tenant Video Engine</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-6xl sm:leading-[1.15]">
            Your own video website,{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              ready in minutes.
            </span>
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-neutral-600 sm:text-xl">
            Pick a stunning storefront template, upload or import high-definition videos, customize your brand identity with real-time preview, and publish under your own domain.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {user ? (
              <Link
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 px-6 py-3.5 text-base font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-lg active:scale-[0.99]"
                href="/dashboard"
              >
                <span>Open Dashboard</span>
                <span>→</span>
              </Link>
            ) : (
              <>
                <Link
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 px-6 py-3.5 text-base font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-lg active:scale-[0.99]"
                  href="/register"
                >
                  <span>Start for Free</span>
                  <span>→</span>
                </Link>
                <Link
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-6 py-3.5 text-base font-semibold text-neutral-700 shadow-xs transition-all hover:bg-neutral-50 hover:border-neutral-400"
                  href="/login"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Feature Grid */}
        <section className="mt-24 grid gap-8 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200/90 bg-white p-7 shadow-xs transition-all hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-5">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4 4 4 0 014-4 2 2 0 012 2v2a2 2 0 002 2 2 2 0 012-2 4 4 0 014 4 4 4 0 01-4 4H7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Live Customizer Studio</h3>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Real-time design studio with live desktop, tablet & mobile previews. Curated palettes, typography, corner radii, and WCAG accessibility contrast scoring.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200/90 bg-white p-7 shadow-xs transition-all hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mb-5">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Adaptive HLS Streaming</h3>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Industrial FFmpeg transcoding pipeline automatically generating multi-resolution HLS renditions with instant buffering and resume playback.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200/90 bg-white p-7 shadow-xs transition-all hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-5">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Domains & Deep SEO</h3>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Connect your own custom domains with automated TLS certificates. Complete with JSON-LD schema, video sitemaps, and OpenGraph social cards.
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="mt-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Simple, transparent plans</h2>
            <p className="mt-2 text-neutral-600">Start for free today and upgrade whenever your audience grows.</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 max-w-4xl mx-auto">
            <div className="rounded-2xl border border-neutral-200/90 bg-white p-8 shadow-xs">
              <div className="inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                Starter
              </div>
              <h3 className="mt-4 text-2xl font-bold text-neutral-900">Free</h3>
              <p className="mt-1 text-3xl font-extrabold text-neutral-900">$0 <span className="text-sm font-normal text-neutral-500">/ month</span></p>
              <p className="mt-4 text-sm text-neutral-600">Perfect for hobbies, personal channels, and getting started.</p>

              <ul className="mt-6 space-y-3 border-t border-neutral-100 pt-6 text-sm text-neutral-700">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✓</span> Free platform subdomain
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✓</span> 5 GB high-speed video storage
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✓</span> Up to 720p HD renditions
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✓</span> Up to 100 videos
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✓</span> Curated theme presets
                </li>
              </ul>

              <Link
                href="/register"
                className="mt-8 block w-full rounded-xl border border-neutral-300 bg-white py-3 text-center text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Create free site
              </Link>
            </div>

            <div className="relative rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-md">
              <div className="absolute -top-3.5 right-6 inline-flex rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-0.5 text-xs font-bold text-white shadow-xs">
                RECOMMENDED
              </div>
              <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Pro Creators & Businesses
              </div>
              <h3 className="mt-4 text-2xl font-bold text-neutral-900">Premium</h3>
              <p className="mt-1 text-3xl font-extrabold text-neutral-900">$29 <span className="text-sm font-normal text-neutral-500">/ month</span></p>
              <p className="mt-4 text-sm text-neutral-600">Everything you need to launch a professional, branded video brand.</p>

              <ul className="mt-6 space-y-3 border-t border-neutral-100 pt-6 text-sm text-neutral-700">
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 font-bold">✓</span> <strong>Custom domains</strong> with auto-SSL
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 font-bold">✓</span> <strong>200 GB</strong> storage & 1080p Full HD
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 font-bold">✓</span> <strong>Unlimited videos</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 font-bold">✓</span> <strong>Custom themes & custom CSS</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600 font-bold">✓</span> <strong>No platform badge</strong> & your own ads
                </li>
              </ul>

              <Link
                href="/register"
                className="mt-8 block w-full rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 py-3 text-center text-sm font-semibold text-white shadow-sm hover:from-blue-500 hover:to-blue-600 transition-all"
              >
                Get started with Premium
              </Link>
            </div>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </>
  );
}
