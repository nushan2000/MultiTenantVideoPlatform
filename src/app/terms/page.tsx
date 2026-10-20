import PlatformFooter from "@/components/PlatformFooter";

export const metadata = { title: "Terms of Service", description: "The terms that apply when you use VideoPlatform.", alternates: { canonical: "/terms" } };

export default function Terms() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6">
      <h1 className="mb-4 text-2xl font-bold">Terms of Service</h1>
      <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-3">
        TEMPLATE ONLY: have these terms written/reviewed by a lawyer before launch, including adult-content rules, record-keeping
        duties (e.g. 18 U.S.C. 2257-style requirements) and local-law requirements.
      </p>
      <p>By creating an account you agree to use the service lawfully, to upload only content you own or have the right to distribute, and to
        comply with the Acceptable Use Policy. We may remove content and suspend sites that violate these terms, respond to abuse and copyright
        (DMCA) reports, and cooperate with law enforcement.</p>
    </main>
      <PlatformFooter />
    </>
  );
}
