// Overrides layered on top of classic-grid's stylesheet. Spacing derives from --gap / --card-min so the density setting still works.
export const css = `
.sf-wrap{max-width:86rem;padding:0 .75rem}
.sf-header{position:sticky;top:0;z-index:30;background:var(--bg);border-bottom:2px solid var(--primary)}
.sf-header .sf-wrap{padding-top:.5rem;padding-bottom:.5rem}
.sf-brand{text-transform:uppercase;letter-spacing:.05em;font-weight:800}
.sf-search{max-width:42rem}
.sf-search input{border-radius:999px 0 0 999px;padding:.5rem 1rem}
.sf-search .sf-btn{border-radius:0 999px 999px 0;font-weight:600}
.sf-nav a{text-transform:uppercase;font-size:.78rem;font-weight:600;letter-spacing:.04em}
.sf-main{padding:1rem 0 2rem}
.sf h1{font-size:1.2rem;margin-bottom:.6rem}
.sf h2{font-size:.95rem;text-transform:uppercase;letter-spacing:.05em;margin:1.1rem 0 .6rem;padding-left:.6rem;border-left:4px solid var(--primary)}
.sf-chips{gap:.35rem;padding-bottom:.75rem}
.sf-chip{border-radius:calc(var(--radius)*.5);text-transform:uppercase;font-size:.72rem;font-weight:600;letter-spacing:.03em;padding:.3rem .7rem}
.sf-grid{gap:calc(var(--gap)*.6);grid-template-columns:repeat(auto-fill,minmax(calc(var(--card-min)*.78),1fr))}
.sf-thumb{border-radius:calc(var(--radius)*.5)}
.sf-card:hover .sf-thumb{outline:2px solid var(--primary);outline-offset:-2px}
.sf-dur{background:rgba(0,0,0,.88);font-weight:700;font-size:.7rem;padding:.15rem .4rem;letter-spacing:.02em}
.sf-title{font-size:.85rem;margin-top:.35rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sf-meta{font-size:.72rem}
.sf-footer{margin-top:1rem}
`;
