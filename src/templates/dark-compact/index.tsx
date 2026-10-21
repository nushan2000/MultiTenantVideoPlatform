import { classicGrid } from "../classic-grid";
import type { ShellProps, Template } from "../types";
import { css } from "./styles";

/**
 * Same pages, data and components as Classic grid; only the Shell differs, adding a dense dark-first stylesheet after the base one.
 * Everything still reads the theme tokens, so tenants can recolour it like any other template.
 */
function Shell(p: ShellProps) {
  return (
    <classicGrid.Shell {...p}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {p.children}
    </classicGrid.Shell>
  );
}

export const darkCompact: Template = {
  ...classicGrid,
  id: "dark-compact",
  name: "Dark compact",
  description: "Dark and dense, with a sticky header, prominent search and a tight thumbnail grid.",
  defaults: { preset: "midnight", density: "compact" },
  Shell,
};
