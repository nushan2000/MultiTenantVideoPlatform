// All colours/spacing come from theme-token CSS variables set on .sf by the Shell.
export const css = `
.sf{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;display:flex;flex-direction:column}
.sf *{box-sizing:border-box}
.sf a{color:inherit;text-decoration:none}
.sf-wrap{width:100%;max-width:72rem;margin:0 auto;padding:0 1rem}
.sf-header{border-bottom:1px solid color-mix(in srgb,var(--text) 12%,transparent);background:color-mix(in srgb,var(--bg) 94%,var(--text))}
.sf-header .sf-wrap{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;padding-top:.75rem;padding-bottom:.75rem}
.sf-brand{display:flex;align-items:center;gap:.6rem;font-weight:700;font-size:1.15rem}
.sf-brand img{height:2rem;width:auto;border-radius:var(--radius)}
.sf-nav{display:flex;gap:1rem;flex:1;flex-wrap:wrap;font-size:.95rem}
.sf-nav a:hover{color:var(--primary)}
.sf-search{display:flex;gap:.4rem}
.sf-search input{padding:.4rem .7rem;border:1px solid color-mix(in srgb,var(--text) 25%,transparent);border-radius:var(--radius);background:var(--bg);color:var(--text);min-width:10rem}
.sf-btn{background:var(--primary);color:#fff;border:0;border-radius:var(--radius);padding:.45rem .9rem;cursor:pointer;font:inherit}
.sf-main{flex:1;padding:1.5rem 0 3rem}
.sf h1{font-size:1.5rem;margin:0 0 1rem}.sf h2{font-size:1.2rem;margin:1.5rem 0 .8rem}
.sf-grid{display:grid;gap:var(--gap);grid-template-columns:repeat(auto-fill,minmax(var(--card-min),1fr))}
.sf-card{display:block}
.sf-thumb{position:relative;aspect-ratio:16/9;background:color-mix(in srgb,var(--text) 10%,var(--bg));border-radius:var(--radius);overflow:hidden}
.sf-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.sf-dur{position:absolute;right:.4rem;bottom:.4rem;background:rgba(0,0,0,.75);color:#fff;font-size:.75rem;padding:.1rem .35rem;border-radius:4px}
.sf-title{margin:.5rem 0 .1rem;font-weight:600;line-height:1.25}
.sf-card:hover .sf-title{color:var(--primary)}
.sf-meta{font-size:.8rem;opacity:.65}
.sf-player{aspect-ratio:16/9;background:#000;border-radius:var(--radius);overflow:hidden;position:relative}
.sf-player video{width:100%;height:100%;display:block;background:#000}
.sf-watch{display:grid;gap:1.5rem;grid-template-columns:minmax(0,1fr)}
@media(min-width:62rem){.sf-watch{grid-template-columns:minmax(0,1fr) 20rem}}
.sf-related{display:grid;gap:.9rem}
.sf-related .sf-card{display:grid;grid-template-columns:8rem 1fr;gap:.6rem}
.sf-desc{white-space:pre-wrap;margin-top:.8rem;opacity:.85}
.sf-banner{margin:1rem 0;text-align:center;overflow:hidden}
.sf-footer{border-top:1px solid color-mix(in srgb,var(--text) 12%,transparent);padding:1rem 0;font-size:.8rem;opacity:.7}
.sf-footer .sf-wrap{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.sf-badge a{color:var(--primary);font-weight:600}
.sf-empty{opacity:.6;padding:2rem 0}
.sf-report{margin-top:1.5rem;font-size:.9rem}
.sf-report summary{cursor:pointer;opacity:.7}
.sf-report form{display:grid;gap:.5rem;margin-top:.6rem;max-width:28rem}
.sf-report select,.sf-report textarea,.sf-report input{padding:.4rem .6rem;border:1px solid color-mix(in srgb,var(--text) 25%,transparent);border-radius:var(--radius);background:var(--bg);color:var(--text);font:inherit}
.sf-gate{min-height:100vh;display:grid;place-items:center;padding:1rem;text-align:center}
.sf-gate div{max-width:26rem}
`;
