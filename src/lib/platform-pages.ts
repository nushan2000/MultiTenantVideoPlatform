// The platform's own legal/help pages (the marketing site needs them too: signup, payments and hosting all require them).
// Markdown, rendered with the same sanitiser as tenant pages. TEMPLATES: have them reviewed by a lawyer before launch.

export type PlatformDoc = { slug: string; title: string; description: string; body: (c: { email?: string }) => string };

const mail = (e?: string) => (e ? `[${e}](mailto:${e})` : "the contact details on our [Contact](/contact) page");

export const PLATFORM_DOCS: PlatformDoc[] = [
  {
    slug: "about", title: "About", description: "What VideoPlatform is and who it is for.",
    body: () => `## What we do

VideoPlatform lets anyone create their own video website in minutes. Pick a template, upload videos or import them from a direct link, and publish on a free subdomain, or on your own domain with Premium.

## Built for video sites

Every site comes with the pages and tools a video site needs: fast adaptive streaming, categories, search, trending, SEO tools, and the standard legal pages (Privacy, Terms, Copyright/DMCA, Cookies and more), ready to edit.

## Responsible hosting

We take content seriously: sites can be age-gated and labelled, every video can be reported, and we act on copyright and abuse reports. See our [Acceptable Use Policy](/aup) and [Copyright / DMCA policy](/dmca).`,
  },
  {
    slug: "contact", title: "Contact", description: "How to reach the VideoPlatform team.",
    body: (c) => `## Get in touch

For support, billing or business questions, contact us at ${mail(c.email)}.

## Reporting content on a customer's site

Use the **Report** link under the video on that site. For copyright notices see our [Copyright / DMCA policy](/dmca).

## Reporting abuse of the platform

Email ${mail(c.email)} with the address of the site and a description of the problem.`,
  },
  {
    slug: "privacy", title: "Privacy Policy", description: "How VideoPlatform handles personal information.",
    body: (c) => `_Last updated: ${new Date().toISOString().slice(0, 10)}_

## What we collect

- **Account data:** name, email and a salted hash of your password when you register
- **Site and billing data:** your site settings and subscription status. Card details are handled by our payment processor and never stored by us.
- **Technical data:** IP address, browser and usage logs, used for security, abuse prevention and rate limiting
- **Content:** the videos and text you publish, which are stored on our servers on your behalf

## How we use it

To run and secure the service, process payments, respond to reports and support requests, and meet legal obligations. We do not sell personal data.

## Visitors to your site

If you run a site on VideoPlatform you are responsible for your own visitors' data and should publish your own policies. We provide editable templates in your dashboard under **Pages**.

## Retention and your rights

We keep data while your account is active and as required by law. You may request access, correction or deletion by contacting ${mail(c.email)}.

## Cookies

See our [Cookie Policy](/cookies).`,
  },
  {
    slug: "dmca", title: "Copyright / DMCA Policy", description: "How to report copyright infringement on VideoPlatform.",
    body: (c) => `VideoPlatform responds to notices of alleged copyright infringement under the U.S. Digital Millennium Copyright Act (DMCA) and similar laws.

## Send a notice

Use the **Report** link under the video (choose **Copyright (DMCA) notice** and include your email), or email ${mail(c.email)} with:

1. The copyrighted work you claim is infringed
2. The address (URL) of the video
3. Your name, address and email
4. A good-faith statement that the use is not authorised
5. A statement, under penalty of perjury, that your notice is accurate and you are the owner or authorised to act for the owner
6. Your signature

## Our response

We promptly remove or disable access to the material and notify the site owner, who may send a counter-notice. Repeat infringers lose their accounts.`,
  },
  {
    slug: "cookies", title: "Cookie Policy", description: "Which cookies VideoPlatform uses.",
    body: () => `We use only the cookies needed to run the service:

| Cookie | Purpose |
|---|---|
| Session cookie | Keeps you signed in to your dashboard |
| Security token | Protects forms from cross-site request forgery |

We do not use advertising cookies on this website. Customer sites may use their own; see each site's cookie policy.`,
  },
];

export const platformDoc = (slug: string) => PLATFORM_DOCS.find((d) => d.slug === slug);
