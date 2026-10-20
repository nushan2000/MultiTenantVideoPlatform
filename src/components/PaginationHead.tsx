/**
 * rel=prev / rel=next and (for page 2+) the self-referencing canonical, as real <link> tags.
 * React 19 hoists these into <head>. Done here, not through Next's metadata API, because that API strips "?page=N"
 * from canonical URLs, which would make every page of a list claim to be page 1.
 */
export default function PaginationHead({ origin, path, page, totalPages }: { origin: string; path: string; page: number; totalPages: number }) {
  const base = path === "/" ? `${origin}/` : `${origin}${path}`;
  const url = (n: number) => (n > 1 ? `${base}?page=${n}` : base);
  return (
    <>
      {page > 1 && <link rel="canonical" href={url(page)} />}
      {page > 1 && <link rel="prev" href={url(page - 1)} />}
      {page < totalPages && <link rel="next" href={url(page + 1)} />}
    </>
  );
}
