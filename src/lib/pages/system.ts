import type { Profile } from "./profile";

/**
 * The sections a video-streaming site is expected to have (YouTube-style): About, Contact, FAQ, Privacy, Terms,
 * Copyright/DMCA, Cookies, Community Guidelines, and for adult sites 18 U.S.C. 2257 + Parental controls.
 * They exist from day one as generated text. The owner can edit any of them (a Page row then overrides the default);
 * the `mandatory` ones can be edited but not unpublished or deleted.
 * NOTE: these are starting-point templates, not legal advice. The dashboard says so.
 */
export type PageCtx = { siteName: string; siteUrl: string; profile: Profile; adult: boolean };

export type SystemPageDef = {
  key: string;
  slug: string;
  title: string;
  group: "help" | "legal";
  mandatory: boolean;
  adultOnly?: boolean;
  /** Default meta description. */
  description: (c: PageCtx) => string;
  /** Default Markdown body. */
  body: (c: PageCtx) => string;
};

const who = (c: PageCtx) => c.profile.legalName || c.siteName;
const email = (c: PageCtx) => c.profile.contactEmail;
const contactLine = (c: PageCtx) => (email(c) ? `You can reach us at [${email(c)}](mailto:${email(c)}).` : "You can reach us through the contact options on the [Contact](/contact) page.");

export const SYSTEM_PAGES: SystemPageDef[] = [
  {
    key: "about", slug: "about", title: "About", group: "help", mandatory: false,
    description: (c) => `Learn about ${c.siteName}: who we are, what we publish and how to get in touch.`,
    body: (c) => `## Welcome to ${c.siteName}

${c.siteName} is a video website where we publish and share videos with our community. Browse the latest uploads on the [home page](/), explore [categories](/categories), or see what is [trending](/trending).

## What you will find here

- New videos added regularly
- Videos organised into categories so you can find what you like quickly
- Free streaming in your browser, on desktop and mobile

## Who runs this site

${c.profile.legalName ? `${c.siteName} is operated by ${c.profile.legalName}${c.profile.country ? `, ${c.profile.country}` : ""}.` : `${c.siteName} is an independent video site.`} ${contactLine(c)}

## Content and copyright

We take rights seriously. Read our [Copyright / DMCA policy](/dmca) and our [Community Guidelines](/community-guidelines), and use the **Report** link under any video if something is wrong.`,
  },
  {
    key: "contact", slug: "contact", title: "Contact us", group: "help", mandatory: true,
    description: (c) => `How to contact ${c.siteName}: support, business enquiries, copyright and abuse reports.`,
    body: (c) => `## Get in touch

${email(c) ? `**Email:** [${email(c)}](mailto:${email(c)})\n` : ""}${c.profile.contactAddress ? `\n**Address:** ${c.profile.contactAddress}\n` : ""}${c.profile.legalName ? `\n**Operated by:** ${c.profile.legalName}\n` : ""}
${c.profile.responseTime ? `We usually reply ${c.profile.responseTime}.` : "We usually reply within a few business days."}

## Reporting content

- **Something inappropriate or illegal?** Use the **Report** link below the video. Reports are reviewed by our team.
- **Copyright holder?** See our [Copyright / DMCA policy](/dmca) for how to send a notice.
- **Privacy request?** See our [Privacy Policy](/privacy).

## Common questions

Many answers are in our [FAQ](/faq).`,
  },
  {
    key: "faq", slug: "faq", title: "FAQ", group: "help", mandatory: false,
    description: (c) => `Frequently asked questions about watching videos on ${c.siteName}.`,
    body: (c) => `## Watching

**Do I need an account to watch?**
No. You can watch videos without signing up.

**A video will not play. What should I do?**
Refresh the page, check your connection, and try another browser. Quality adapts automatically to your connection speed. If the problem continues, [contact us](/contact).

**Can I download videos?**
Downloads are not offered. You can share a link or embed a video using the **Share** button.

## Sharing

**How do I share or embed a video?**
Open the video and press **Share**. Copy the link, or copy the embed code to put the video on your own page.

## Content

**How do I report a video?**
Use the **Report** link under the video. For copyright notices see the [DMCA policy](/dmca).

**Who owns the videos?**
Videos are owned by their respective rights holders. See our [Terms of Service](/terms).

## Privacy

**What data do you collect?**
See our [Privacy Policy](/privacy) and [Cookie Policy](/cookies).`,
  },
  {
    key: "privacy", slug: "privacy", title: "Privacy Policy", group: "legal", mandatory: true,
    description: (c) => `How ${c.siteName} collects, uses and protects your information.`,
    body: (c) => `_Last updated: ${new Date().toISOString().slice(0, 10)}_

This Privacy Policy explains how ${who(c)} ("we", "us") handles information when you use ${c.siteName} (${c.siteUrl}).

## Information we collect

- **Technical data:** IP address, browser type, device and pages viewed. We use it to deliver videos, count views, prevent abuse and keep the site secure.
- **Reports and messages:** if you report a video or contact us, we keep what you send (including your email if you give it) so we can respond.
- **Cookies and similar technologies:** see our [Cookie Policy](/cookies).

We do not require you to create an account to watch videos.

## How we use information

- To provide, secure and improve the service
- To count views and understand which videos are popular
- To investigate reports, enforce our [Terms](/terms) and meet legal obligations
- To show advertising, where ads are enabled on this site

## Advertising

This site may display video and banner advertising supplied by us or by advertising partners. Ad providers may use cookies or similar technologies as described in their own policies.

## Sharing

We do not sell your personal information. We share information only with service providers that help us run the site (hosting, delivery, security), when required by law, or to protect rights and safety.

## Retention and security

We keep information only as long as needed for the purposes above or as the law requires, and use reasonable technical and organisational measures to protect it.

## Your rights

Depending on where you live you may have rights to access, correct, delete or restrict the use of your personal data, and to object to processing. ${contactLine(c)}

## Children

${c.adult ? "This site contains adult content and is intended only for people aged 18 or over. We do not knowingly collect data from minors." : "This site is not directed to children under 13 and we do not knowingly collect their personal data."}

## Changes

We may update this policy. The date above shows the latest revision.

## Contact

${who(c)}${c.profile.contactAddress ? `, ${c.profile.contactAddress}` : ""}. ${contactLine(c)}`,
  },
  {
    key: "terms", slug: "terms", title: "Terms of Service", group: "legal", mandatory: true,
    description: (c) => `The terms that apply when you use ${c.siteName}.`,
    body: (c) => `_Last updated: ${new Date().toISOString().slice(0, 10)}_

By using ${c.siteName} you agree to these terms. If you do not agree, please do not use the site.

## Use of the service

You may watch and share videos for personal, non-commercial use. You agree not to misuse the site: no scraping or automated bulk downloading, no attempts to disrupt or gain unauthorised access, and no use that breaks the law.

${c.adult ? "## Age requirement\n\nThis site contains adult content. You must be at least 18 years old (or the age of majority where you live) to enter.\n\n" : ""}## Content and ownership

Videos and other materials are owned by ${who(c)} or by their respective rights holders and are protected by copyright and other laws. Nothing on this site gives you a licence to copy, redistribute or exploit content except where we expressly allow it (for example, using the embed code provided by the Share button).

## Reporting and removal

We respond to reports of illegal, infringing or abusive content. See our [Copyright / DMCA policy](/dmca) and [Community Guidelines](/community-guidelines). We may remove content or restrict access at any time.

## Disclaimer

The service is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free operation.

## Limitation of liability

To the extent permitted by law, ${who(c)} is not liable for indirect or consequential losses arising from your use of the site.

## Changes and governing law

We may update these terms; continued use means you accept the changes. ${c.profile.country ? `These terms are governed by the laws of ${c.profile.country}.` : ""}

## Contact

${contactLine(c)}`,
  },
  {
    key: "dmca", slug: "dmca", title: "Copyright / DMCA Policy", group: "legal", mandatory: true,
    description: (c) => `How to report copyright infringement on ${c.siteName} and how we respond to notices.`,
    body: (c) => `${who(c)} respects intellectual property rights and responds to notices of alleged copyright infringement that comply with the law, including the U.S. Digital Millennium Copyright Act (DMCA).

## How to submit a notice

The quickest way is the **Report** link under the video: choose **Copyright (DMCA) notice** and include your email address.

You can also write to our designated agent:

${c.profile.dmcaAgentName || c.profile.dmcaAgentEmail ? `**Designated agent:** ${c.profile.dmcaAgentName ?? who(c)}  \n${c.profile.dmcaAgentEmail ? `**Email:** [${c.profile.dmcaAgentEmail}](mailto:${c.profile.dmcaAgentEmail})  \n` : ""}${c.profile.dmcaAgentAddress ? `**Address:** ${c.profile.dmcaAgentAddress}` : ""}` : contactLine(c)}

Your notice must include:

1. Identification of the copyrighted work you claim is infringed
2. The URL of the video on this site
3. Your contact information (name, address, email)
4. A statement that you have a good-faith belief the use is not authorised by the copyright owner, its agent or the law
5. A statement, under penalty of perjury, that the information is accurate and that you are the owner or authorised to act for the owner
6. Your physical or electronic signature

## What happens next

When we receive a valid notice we will promptly remove or disable access to the material and may notify the person who published it.

## Counter-notice

If you believe material was removed by mistake you may send a counter-notice with: identification of the removed material, a statement under penalty of perjury that you have a good-faith belief it was removed by mistake, your contact details and consent to the relevant court's jurisdiction, and your signature. If the original complainant does not start legal action within 10 business days we may restore the material.

## Repeat infringers

We terminate access for users who are repeat infringers in appropriate circumstances.

Knowingly submitting a false notice may result in liability.`,
  },
  {
    key: "cookies", slug: "cookies", title: "Cookie Policy", group: "legal", mandatory: true,
    description: (c) => `Which cookies ${c.siteName} uses and why.`,
    body: (c) => `Cookies are small text files stored in your browser. ${c.siteName} keeps their use to a minimum.

## Cookies we use

| Cookie | Purpose | Duration |
|---|---|---|
${c.adult ? "| age_ok | Remembers that you confirmed you are 18 or older | 30 days |\n" : ""}| Playback and preferences | Remember settings needed to play videos | Session |

## Third-party cookies

If advertising is shown, ad providers may set their own cookies. You can control cookies in your browser settings; blocking them may affect how some features work.

## More information

See our [Privacy Policy](/privacy). ${contactLine(c)}`,
  },
  {
    key: "community", slug: "community-guidelines", title: "Community Guidelines", group: "legal", mandatory: false,
    description: (c) => `The rules for content and behaviour on ${c.siteName}.`,
    body: (c) => `We want ${c.siteName} to be a safe and lawful place. Content that breaks these rules is removed.

## Not allowed

- Content that sexualises minors in any way. This is reported to the authorities.
- Non-consensual content, harassment, threats or hate speech
- Content you do not have the right to share (see our [Copyright / DMCA policy](/dmca))
- Malware, scams or deceptive content
- Illegal content of any kind

${c.adult ? "## Adult content\n\nAdult material is allowed only because this site is age-gated and labelled. All performers must be adults who consented.\n\n" : ""}## Reporting

Use the **Report** link under any video. We review reports and may remove content or restrict access.`,
  },
  {
    key: "2257", slug: "2257", title: "18 U.S.C. 2257 Record-Keeping Compliance Statement", group: "legal", mandatory: true, adultOnly: true,
    description: (c) => `18 U.S.C. 2257 compliance statement for ${c.siteName}.`,
    body: (c) => `All models, actors and other persons appearing in visual depictions on ${c.siteName} were at least 18 years of age when the depictions were created.

Records required by 18 U.S.C. 2257 and 28 C.F.R. 75 are kept by the custodian of records:

**Custodian of records:** ${c.profile.custodianName || who(c)}
${c.profile.custodianAddress ? `**Address:** ${c.profile.custodianAddress}  \n` : ""}${email(c) ? `**Contact:** [${email(c)}](mailto:${email(c)})` : ""}

Where content is supplied by third parties, those producers are responsible for their own record-keeping, and we require uploaders to confirm they hold the records.`,
  },
  {
    key: "parental", slug: "parental-controls", title: "Parental Controls", group: "legal", mandatory: true, adultOnly: true,
    description: (c) => `How to block access to ${c.siteName} with parental-control software.`,
    body: (c) => `${c.siteName} is for adults only. We label every page with the **RTA (Restricted To Adults)** label so filtering software can block it.

## Protect your children

- Use the parental-control features built into your operating system, router and browser
- Install filtering software that recognises the RTA label (see [rta.org](https://www.rtalabel.org/))
- Keep devices in shared spaces and talk to children about online safety

If you believe a minor has accessed this site, please [contact us](/contact).`,
  },
];

export const systemPageByKey = (key: string) => SYSTEM_PAGES.find((p) => p.key === key);
export const systemPageBySlug = (slug: string) => SYSTEM_PAGES.find((p) => p.slug === slug);
export const systemPagesFor = (adult: boolean) => SYSTEM_PAGES.filter((p) => !p.adultOnly || adult);

/** Slugs custom pages may never use: routes of the storefront + every system slug (those are managed as system pages). */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  "v", "c", "tag", "search", "embed", "trending", "categories", "sitemap", "sitemaps", "sitemap.xml", "robots.txt", "feed.xml", "manifest.webmanifest",
  "api", "_next", "login", "register", "dashboard", "admin", "favicon.ico", "index", "home", "p", "indexnow-key.txt",
  ...SYSTEM_PAGES.map((p) => p.slug),
]);
