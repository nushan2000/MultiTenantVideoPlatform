import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PlatformFooter from "@/components/PlatformFooter";
import { renderMarkdown } from "@/lib/pages/markdown";
import { PLATFORM_DOCS, platformDoc } from "@/lib/platform-pages";

export function generateStaticParams() {
  return PLATFORM_DOCS.map((d) => ({ doc: d.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const d = platformDoc((await params).doc);
  return d ? { title: d.title, description: d.description, alternates: { canonical: `/${d.slug}` } } : {};
}

export default async function PlatformDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const d = platformDoc((await params).doc);
  if (!d) notFound();
  const html = renderMarkdown(d.body({ email: process.env.PLATFORM_CONTACT_EMAIL }));
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": d.slug === "about" ? "AboutPage" : d.slug === "contact" ? "ContactPage" : "WebPage", name: d.title, description: d.description }} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-6 text-3xl font-bold">{d.title}</h1>
        <div className="space-y-3 leading-7 [&_a]:text-blue-700 [&_a]:underline [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_table]:border [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
      <PlatformFooter />
    </>
  );
}
