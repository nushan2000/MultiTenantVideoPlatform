/** Structured data. `<` is escaped so tenant-supplied text can never close the script tag. */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

export default function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data)
    .replace(/</g, "\u003c")
    .split(LS).join("\u2028")
    .split(PS).join("\u2029");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
