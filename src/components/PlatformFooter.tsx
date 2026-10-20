import Link from "next/link";

const LINKS: [string, string][] = [["About", "/about"], ["Contact", "/contact"], ["Terms", "/terms"], ["Acceptable Use", "/aup"], ["Privacy", "/privacy"], ["Copyright / DMCA", "/dmca"], ["Cookies", "/cookies"]];

export default function PlatformFooter() {
  return (
    <footer className="mt-16 border-t border-neutral-200 py-8 text-sm text-neutral-600">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6">
        <span>© {new Date().getFullYear()} VideoPlatform</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          {LINKS.map(([t, h]) => <Link key={h} href={h} className="hover:underline">{t}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
