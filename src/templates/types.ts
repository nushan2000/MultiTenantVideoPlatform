import type { ReactNode } from "react";
import type { Features, Theme } from "@/lib/theme";

export type StoreVideo = {
  id: string;
  href: string; // canonical path, e.g. /v/my-handle
  title: string;
  description: string | null;
  thumbUrl: string | null;
  durationSec: number | null;
  views: number;
  createdAt: Date;
  categoryName?: string | null;
};

export type StoreCategory = { slug: string; name: string };
export type Crumb = { name: string; href: string };

export type ShellProps = {
  tenant: { name: string; logoUrl: string | null };
  theme: Theme;
  features: Features;
  categories: StoreCategory[];
  showBadge: boolean;
  allowCustomCss: boolean;
  searchQuery?: string;
  banner?: string | null; // sanitised ad HTML
  lang?: string; // BCP-47, e.g. "en"
  bare?: boolean; // age-gate interstitial: no header/nav/content leakage
  children: ReactNode;
};

export type HomeProps = { heading: string; intro?: string | null; featured: StoreVideo[]; latest: StoreVideo[]; features: Features };
export type ListingProps = { heading: string; intro?: string | null; videos: StoreVideo[]; emptyText: string; breadcrumbs?: Crumb[] };
export type WatchProps = {
  video: StoreVideo;
  related: StoreVideo[];
  breadcrumbs?: Crumb[];
  player: ReactNode; // the HLS player (client component), built by the page
  report: ReactNode; // abuse/DMCA form, always present
  banner?: string | null;
  features: Features;
};

/**
 * A storefront template. Add a new one by creating templates/<id>/ and registering it in registry.ts;
 * core pages only ever talk to this interface. Templates style themselves from the theme-token CSS variables
 * (--primary, --bg, --text, --font, --radius, --gap, --card-min) so tenants can recolour without code.
 */
export type Template = {
  id: string;
  name: string;
  Shell: (p: ShellProps) => ReactNode;
  Home: (p: HomeProps) => ReactNode;
  Listing: (p: ListingProps) => ReactNode;
  Watch: (p: WatchProps) => ReactNode;
};
