import { createSiteAction } from "../actions";
import { Flash } from "@/components/ui";
import { THEME_PRESETS } from "@/lib/theme";
import { listTemplates } from "@/templates/registry";
import Wizard from "./Wizard";

export default async function NewSite({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const presets = Object.entries(THEME_PRESETS).map(([key, p]) => ({ key, label: p.label, primary: p.theme.primaryColor!, bg: p.theme.bgColor! }));
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Create your site</h1>
      <Flash error={error} />
      <Wizard action={createSiteAction} templates={listTemplates()} presets={presets} />
    </>
  );
}
