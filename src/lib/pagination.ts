export const PAGE_SIZE = 24;

/** ?page=N -> 1..500 (bounded so a crawler cannot ask for absurd offsets). */
export function parsePage(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 500) : 1;
}

/** Page 1 is the canonical, parameter-free URL; later pages use ?page=N. */
export const pageHref = (base: string, n: number) => (n <= 1 ? base : `${base}?page=${n}`);

export const totalPagesOf = (count: number, size = PAGE_SIZE) => Math.max(1, Math.ceil(count / size));
