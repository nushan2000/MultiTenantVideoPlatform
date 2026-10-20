import PlatformFooter from "@/components/PlatformFooter";

export const metadata = { title: "Acceptable Use Policy", description: "What you may and may not publish on VideoPlatform.", alternates: { canonical: "/aup" } };

export default function Aup() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6">
      <h1 className="mb-4 text-2xl font-bold">Acceptable Use Policy</h1>
      <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-3">TEMPLATE ONLY: requires legal review before launch.</p>
      <ul className="list-disc pl-5">
        <li>No content involving minors in any sexual context. Such content is reported to the authorities.</li>
        <li>No non-consensual content, content you do not have the rights to, or content that violates the law.</li>
        <li>Adult content is permitted only on sites flagged as adult, which are age-gated and labelled.</li>
        <li>No malware, scraping of other platforms, or abuse of the import feature (direct file links you have rights to only).</li>
      </ul>
    </main>
      <PlatformFooter />
    </>
  );
}
