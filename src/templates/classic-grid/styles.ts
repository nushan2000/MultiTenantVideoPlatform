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
.sf-nav{display:flex;gap:1rem;margin-left:auto;flex-wrap:wrap;font-size:.95rem}
.sf-nav a:hover{color:var(--primary)}
.sf-search{display:flex;gap:.4rem;flex:1;max-width:30rem}.sf-search input{flex:1}
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

.sf-skip{position:absolute;left:-999px;top:0;background:var(--primary);color:#fff;padding:.5rem 1rem;z-index:50}.sf-skip:focus{left:0}
.sf-chips{display:flex;gap:.5rem;overflow-x:auto;padding:.25rem 0 1rem;scrollbar-width:thin}
.sf-chip{display:inline-block;white-space:nowrap;padding:.3rem .8rem;border-radius:999px;background:color-mix(in srgb,var(--text) 9%,var(--bg));font-size:.875rem}
.sf-chip:hover{background:color-mix(in srgb,var(--primary) 18%,var(--bg))}.sf-chip-on{background:var(--primary);color:#fff}
.sf-pager{display:flex;justify-content:center;align-items:center;gap:.5rem;flex-wrap:wrap;margin:2rem 0 0;font-size:.9rem}
.sf-footgrid{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));margin-bottom:1.25rem}
.sf-foothead{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;margin:0 0 .5rem;opacity:.8}
.sf-footgrid ul{list-style:none;margin:0;padding:0;display:grid;gap:.35rem}.sf-footgrid a:hover{color:var(--primary);text-decoration:underline}
.sf-footbar{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;border-top:1px solid color-mix(in srgb,var(--text) 12%,transparent);padding-top:1rem}
.sf-article{max-width:48rem}
.sf-prose{line-height:1.7}.sf-prose h2{font-size:1.25rem;margin:1.75rem 0 .5rem}.sf-prose h3{font-size:1.1rem;margin:1.25rem 0 .4rem}.sf-prose p,.sf-prose ul,.sf-prose ol,.sf-prose table,.sf-prose blockquote{margin:.75rem 0}
.sf-prose ul,.sf-prose ol{padding-left:1.4rem}.sf-prose a{color:var(--primary);text-decoration:underline}.sf-prose blockquote{border-left:3px solid var(--primary);padding-left:1rem;opacity:.85}
.sf-prose table{border-collapse:collapse;width:100%}.sf-prose th,.sf-prose td{border:1px solid color-mix(in srgb,var(--text) 20%,transparent);padding:.4rem .6rem;text-align:left}
.sf-prose img{max-width:100%;height:auto;border-radius:var(--radius)}.sf-prose code{background:color-mix(in srgb,var(--text) 10%,var(--bg));padding:.1rem .3rem;border-radius:4px}
.sf-actions{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin:.25rem 0 .75rem}
.sf-more{background:color-mix(in srgb,var(--text) 6%,var(--bg));border-radius:var(--radius);padding:.75rem 1rem;margin-top:.5rem}.sf-more summary{cursor:pointer;list-style:none}.sf-more summary::-webkit-details-marker{display:none}
.sf-link{color:var(--primary);font-weight:600;margin-left:.25rem}
.sf-tags{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.75rem}
.sf-chapters{margin-top:1rem}.sf-chapters ol{list-style:none;padding:0;margin:.4rem 0 0;display:grid;gap:.25rem}.sf-chapters button{background:none;border:0;cursor:pointer;color:inherit;font:inherit;text-align:left}.sf-chapters button:hover{color:var(--primary)}.sf-chapters .t{color:var(--primary);font-variant-numeric:tabular-nums;margin-right:.5rem}
.sf-share{position:relative}.sf-share-panel{position:absolute;right:0;top:110%;z-index:20;width:min(22rem,90vw);background:var(--bg);border:1px solid color-mix(in srgb,var(--text) 20%,transparent);border-radius:var(--radius);padding:1rem;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.sf-share-panel input,.sf-share-panel textarea{width:100%;padding:.4rem .5rem;border:1px solid color-mix(in srgb,var(--text) 25%,transparent);border-radius:var(--radius);background:var(--bg);color:var(--text);font:inherit;font-size:.8rem}
.sf-share-links{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}
`;
