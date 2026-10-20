import type { Metadata } from "next";
import { requireTenant } from "@/lib/access";
import { Card } from "@/components/ui";
import { loadPages } from "@/lib/pages/store";
import { parseProfile } from "@/lib/pages/profile";
import { tenantPublicOrigin } from "@/lib/seo-server";
import BusinessDetails from "./BusinessDetails";
import PagesManager, { type PageDTO } from "./PagesManager";

export const metadata: Metadata = { title: "Pages" };

export default async function PagesTab({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await requireTenant(slug);
  const { origin } = await tenantPublicOrigin({ id: a.tenant.id, slug, planKey: a.planKey });
  const pages = await loadPages(a.tenant, origin);
  const profile = parseProfile(a.tenant.profile);
  const dto: PageDTO[] = pages.map((p) => ({
    id: p.id, key: p.key, slug: p.slug, title: p.title, markdown: p.markdown, description: p.description, group: p.group, mandatory: p.mandatory,
    custom: p.custom, customized: p.customized, published: p.published, inFooter: p.inFooter,
    seo: { title: p.seo.title, description: p.seo.description, keywords: p.seo.keywords, ogImage: p.seo.ogImage, canonicalUrl: p.seo.canonicalUrl, noindex: p.seo.noindex },
  }));
  const s = (v: string | undefined) => v ?? "";
  return (
    <>
      <Card>
        <p className="text-sm text-neutral-700">
          A video site needs more than videos. Yours already has <strong>About, Contact, FAQ, Privacy Policy, Terms of Service, Copyright/DMCA, Cookie Policy and Community Guidelines</strong>
          {a.tenant.contentCategory === "ADULT" ? <>, plus <strong>18 U.S.C. 2257</strong> and <strong>Parental Controls</strong> (adult sites)</> : null}, linked from your footer and sitemap. Fill in your business details so they are accurate, then edit or add pages below.
        </p>
      </Card>
      <BusinessDetails
        tenantId={a.tenant.id} adult={a.tenant.contentCategory === "ADULT"}
        initial={{
          legalName: s(profile.legalName), contactEmail: s(profile.contactEmail), contactAddress: s(profile.contactAddress), country: s(profile.country), responseTime: s(profile.responseTime),
          dmcaAgentName: s(profile.dmcaAgentName), dmcaAgentEmail: s(profile.dmcaAgentEmail), dmcaAgentAddress: s(profile.dmcaAgentAddress), custodianName: s(profile.custodianName), custodianAddress: s(profile.custodianAddress),
        }}
      />
      <PagesManager tenantId={a.tenant.id} origin={origin} siteName={a.tenant.name} pages={dto} />
    </>
  );
}
