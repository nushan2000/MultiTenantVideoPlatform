import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Markdown -> safe HTML. Whatever the owner writes (or pastes) is sanitised: no scripts/handlers/iframes,
 * https-only links and images, external links get rel="noopener noreferrer nofollow ugc".
 */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md.slice(0, 60_000), { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: ["h2", "h3", "h4", "p", "ul", "ol", "li", "a", "strong", "em", "b", "i", "blockquote", "code", "pre", "hr", "br", "table", "thead", "tbody", "tr", "th", "td", "img", "h1"],
    allowedAttributes: { a: ["href", "title", "rel", "target"], img: ["src", "alt", "width", "height"], th: ["align"], td: ["align"] },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    transformTags: {
      h1: "h2", // the page title is the only <h1>
      a: (tag, attribs) => {
        const href = attribs.href ?? "";
        const external = /^https:/i.test(href);
        return { tagName: "a", attribs: { ...attribs, ...(external ? { rel: "noopener noreferrer nofollow ugc", target: "_blank" } : {}) } };
      },
      img: (tag, attribs) => ({ tagName: "img", attribs: { ...attribs, loading: "lazy", decoding: "async" } }),
    },
    // relative links (/privacy, /c/foo, #anchor) are fine: they stay on the site
    allowedSchemesAppliedToAttributes: ["href", "src"],
  });
}

/** Plain text of rendered content (for descriptions). */
export const markdownToText = (md: string) => sanitizeHtml(renderMarkdown(md), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
