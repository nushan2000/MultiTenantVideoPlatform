import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const base = process.env.APP_URL ?? "http://localhost:3000";
const description = "Create your own video website in minutes. Upload or import videos, pick a template and publish on a free subdomain or your own domain.";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: { default: "VideoPlatform: build your own video website", template: "%s · VideoPlatform" },
  description,
  applicationName: "VideoPlatform",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: { type: "website", siteName: "VideoPlatform", title: "VideoPlatform: build your own video website", description },
  twitter: { card: "summary", title: "VideoPlatform", description },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2563eb" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
