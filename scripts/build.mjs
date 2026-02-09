import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const outDir = path.join(process.cwd(), "site");
const srcDir = path.join(process.cwd(), "site-src");
const dataFile = path.join(process.cwd(), "data", "queries.json");
const CHECK_ONLY = new Set(process.argv.slice(2)).has("--check");

function ensureDir(p){ fs.mkdirSync(p, { recursive:true }); }
function readJson(p){ return JSON.parse(fs.readFileSync(p, "utf8")); }
function write(p, s){ ensureDir(path.dirname(p)); fs.writeFileSync(p, s, "utf8"); }
function esc(s=""){ return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function slugify(s){
  return String(s).trim().toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function fetchRssTop(q, limit=5){
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const parser = new XMLParser({ ignoreAttributes:false });
  const res = await fetch(rssUrl, { headers: { "user-agent":"Mozilla/5.0" }});
  const xml = await res.text();
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item || [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const stripHtml = (s="") => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const domainOf = (u) => { try{ return new URL(u).hostname.replace(/^www\./,""); }catch{ return ""; } };
  const toDate = (s) => { try{ return new Date(s).toISOString().slice(0,10); }catch{ return ""; } };
  return arr.slice(0, limit).map(it => ({
    title: stripHtml(it?.title || ""),
    link: it?.link || "",
    date: toDate(it?.pubDate || it?.published || ""),
    domain: domainOf(it?.link || ""),
    snippet: stripHtml(it?.description || it?.content || ""),
  })).filter(x => x.link && x.title);
}

function pageShell({ title, description, canonical, ogImage, body }){
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="robots" content="index,follow">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${esc(ogImage)}">
</head>
<body>
${body}
</body>
</html>`;
}

function chrome(mainHtml){
  const today = new Date().toISOString().slice(0,10);
  return `
  <div class="topbar">
    <div class="container"><div class="row">
      <div class="badge"><span class="dot"></span><strong>Live</strong> · <span class="mono">${today}</span> · <span class="mono">Edge‑Fast</span></div>
      <div class="badge">
        <a class="btn" href="/">Start</a>
        <a class="btn" href="/topics/">Topics</a>
        <a class="btn primary" href="/#pricing">Premium ab €4,99</a>
      </div>
    </div></div>
  </div>
  <header class="header">
    <div class="container">
      <div class="brand">
        <div class="logo">
          <h1>EPSTEIN FILES — AI NEWSROOM</h1>
          <small>Öffentliche Quellen bündeln + KI‑Leseführung. Keine Volltexte, kein Hosting fremder Dokumente.</small>
        </div>
        <div class="badge">
          <a class="btn" href="/impressum.html">Impressum</a>
          <a class="btn" href="/datenschutz.html">Datenschutz</a>
        </div>
      </div>
      <nav class="nav" aria-label="Navigation">
        <a href="/">Start</a>
        <a href="/topics/">Topics</a>
        <a href="/#search">Suche</a>
        <a href="/#pricing">Preise</a>
      </nav>
    </div>
  </header>
  <main class="container" style="padding:18px 0 26px 0">${mainHtml}</main>
  <div class="footer">
    <div class="container" style="padding:0">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <div>© ${new Date().getFullYear()} Wissens‑Bank.</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a href="/impressum.html">Impressum</a>
          <a href="/datenschutz.html">Datenschutz</a>
          <a href="/agb.html">AGB</a>
          <a href="/sitemap.xml">Sitemap</a>
        </div>
      </div>
      <div class="muted" style="margin-top:10px;line-height:1.5">
        Hinweis: Wir hosten keine urheberrechtlich geschützten Inhalte Dritter. Wir verlinken auf öffentlich zugängliche Quellen und erstellen Zusammenfassungen/Leseführung.
      </div>
    </div>
  </div>`;
}

async function generate(){
  ensureDir(outDir);
  ensureDir(path.join(outDir,"assets"));
  write(path.join(outDir,"styles.css"), fs.readFileSync(path.join(srcDir,"styles.css"),"utf8"));
  write(path.join(outDir,"assets/favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f1319"/><path d="M18 42V22h20c6 0 10 3 10 10s-4 10-10 10H18zm8-8h10c2 0 4-1 4-4s-2-4-4-4H26v8z" fill="#6dd6ff"/></svg>`);

  const { queries } = readJson(dataFile);
  const unique = Array.from(new Set((queries||[]).map(s => String(s).trim()).filter(Boolean)));
  const urls = ["/","/topics/","/impressum.html","/datenschutz.html","/agb.html"];

  const chips = unique.slice(0,12).map(q => `<a class="chip" href="/q/${slugify(q)}/">${esc(q)}</a>`).join("");
  const home = chrome(`
    <div class="grid">
      <section class="card pad">
        <div class="kicker">Breaking Index</div>
        <div class="h1">Finde Muster. Nicht nur Schlagzeilen.</div>
        <p class="p muted">Suche nach Namen/Begriffen. Wir zeigen Quellen‑Preview + KI‑Leseführung. Premium entsperrt Deep‑Summary.</p>
        <div class="hr"></div>
        <div id="search">
          <label class="kicker">Suche</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
            <input id="q" class="input" placeholder="z.B. name, organization, case, date…" />
            <button id="go" class="btn primary">KI‑Preview</button>
          </div>
          <div id="out" style="margin-top:12px"></div>
        </div>
        <div class="hr"></div>
        <div class="kicker">Trending Topics</div>
        <div class="chips" style="margin-top:10px">${chips}</div>
      </section>

      <aside class="card pad">
        <div class="kicker">Trust</div>
        <div class="chips" style="margin-top:10px">
          <span class="chip">DB‑frei</span>
          <span class="chip">Edge‑Cache</span>
          <span class="chip">Quellenlinks</span>
          <span class="chip">Schnell & statisch</span>
        </div>
        <div class="hr"></div>
        <div id="pricing">
          <div class="kicker">Preise</div>
          <div class="p" style="margin-top:10px">
            <strong>Premium Monatsabo:</strong> €4,99<br>
            <span class="muted">Deep‑Summary, strukturierte Entities, Context Windows</span>
          </div>
          <div style="margin-top:12px">
            <button id="buyMonthly" class="btn primary" style="width:100%">Premium freischalten</button>
          </div>
          <div class="muted" style="margin-top:10px">Zahlung via Stripe Checkout.</div>
        </div>
      </aside>
    </div>

    <section class="card pad">
      <div class="kicker">How it works</div>
      <div class="p muted">1) Preview aus öffentlichen Quellen · 2) KI‑Leseführung (teaser) · 3) Premium entsperrt Deep‑Summary.</div>
    </section>

    <script type="module">
      const $ = (s)=>document.querySelector(s);
      const q = new URLSearchParams(location.search).get("q");
      if(q){ $("#q").value = q; }

      $("#go").addEventListener("click", run);
      $("#q").addEventListener("keydown", (e)=>{ if(e.key==="Enter") run(); });

      async function run(){
        const term = ($("#q").value||"").trim();
        if(!term) return;
        $("#out").innerHTML = '<div class="muted">Lade…</div>';
        try{
          const res = await fetch("/api/ai-search?q=" + encodeURIComponent(term), { cache:"no-store" });
          const data = await res.json();
          if(!res.ok) throw new Error(data?.error || "Request failed");
          const sources = (data.sources||[]).slice(0,5).map(s=>`
            <div class="story">
              <a class="title" href="${'${'}esc(s.url)}" target="_blank" rel="noreferrer">${'${'}esc(s.title||s.url)}</a>
              <div class="meta"><span>${'${'}esc(s.domain||"")}</span><span class="sep">·</span><span>${'${'}esc(s.date||"")}</span></div>
            </div>`).join("");
          $("#out").innerHTML = `
            <div class="card pad">
              <div class="kicker">KI‑Preview</div>
              <div class="p blur" style="white-space:pre-wrap">${'${'}esc(data.teaser||data.summary||"")}</div>
              <div class="hr"></div>
              <div class="kicker">Quellen</div>
              ${'${'}sources || '<div class="muted">—</div>'}
              <div class="hr"></div>
              <a class="btn primary" href="#pricing">Premium entsperren</a>
            </div>`;
        }catch(e){
          $("#out").innerHTML = '<div class="card pad notice"><strong>Fehler:</strong> ' + esc(e.message) + '</div>';
        }
      }

      $("#buyMonthly").addEventListener("click", async ()=>{
        try{
          const res = await fetch("/api/checkout", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ plan:"monthly" })});
          const data = await res.json();
          if(!res.ok) throw new Error(data?.error || "Checkout failed");
          location.href = data.url;
        }catch(e){
          alert(e.message);
        }
      });

      function esc(s){ return String(s||"").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
    </script>
  `);
  write(path.join(outDir,"index.html"), pageShell({
    title:"Epstein Files – AI Newsroom Index",
    description:"Öffentliche Quellen bündeln + KI‑Leseführung. Premium: Deep‑Summary & strukturierte Hinweise.",
    canonical:"/",
    ogImage:"/api/og?title=Epstein%20Files&subtitle=AI%20Newsroom",
    body:home
  }));

  const allChips = unique.map(q => `<a class="chip" href="/q/${slugify(q)}/">${esc(q)}</a>`).join("");
  write(path.join(outDir,"topics","index.html"), pageShell({
    title:"Topics – AI Newsroom",
    description:"Index: Programmatic Topics für Long‑Tail SEO.",
    canonical:"/topics/",
    ogImage:"/api/og?title=Topics&subtitle=Programmatic%20SEO",
    body:chrome(`<section class="card pad"><div class="kicker">Topics</div><div class="h1" style="font-size:38px">Programmatic SEO Landingpages</div><p class="p muted">Jede Topic‑Seite ist statisch (Preview) + Live‑KI‑Recherche.</p><div class="hr"></div><div class="chips">${allChips}</div></section>`)
  }));

  const legal = {
    company:"Wissens-Bank",
    owner:"Rolf Schwertfechter",
    address:"Karklandsweg 1",
    city:"26553 Dornum",
    email:"rps-vertrieb@t-online.de",
    tax:"Steuerangaben auf Anfrage"
  };

  write(path.join(outDir,"impressum.html"), pageShell({
    title:"Impressum – Wissens‑Bank",
    description:"Impressum der Wissens‑Bank.",
    canonical:"/impressum.html",
    ogImage:"/api/og?title=Impressum&subtitle=Wissens‑Bank",
    body:chrome(`<section class="card pad">
      <div class="kicker">Impressum</div>
      <div class="h1" style="font-size:34px">Angaben gemäß § 5 TMG</div>
      <div class="hr"></div>
      <div class="p">
        <strong>${esc(legal.company)}</strong><br>
        Inhaber: ${esc(legal.owner)}<br>
        Anschrift: ${esc(legal.address)}, ${esc(legal.city)}<br>
        E‑Mail: <a class="btn" href="mailto:${esc(legal.email)}">${esc(legal.email)}</a><br>
        Steuerliche Angaben: ${esc(legal.tax)}
      </div>
      <div class="hr"></div>
      <div class="p muted"><strong>Affiliate‑Hinweis:</strong> Diese Website kann Affiliate‑Links enthalten. Käufe über solche Links können eine Provision erzeugen – ohne Mehrkosten für dich.</div>
    </section>`)
  }));

  write(path.join(outDir,"datenschutz.html"), pageShell({
    title:"Datenschutz – Wissens‑Bank",
    description:"Datenschutzerklärung der Wissens‑Bank.",
    canonical:"/datenschutz.html",
    ogImage:"/api/og?title=Datenschutz&subtitle=Wissens‑Bank",
    body:chrome(`<section class="card pad">
      <div class="kicker">Datenschutz</div>
      <div class="h1" style="font-size:34px">Datenschutzerklärung</div>
      <p class="p muted">Kurzfassung: Zahlungen via Stripe (falls aktiviert). KI‑Anfragen via Google Gemini (falls aktiviert). Wir speichern keine Inhalte dauerhaft serverseitig.</p>
      <div class="hr"></div>
      <div class="p">Verantwortlich: ${esc(legal.company)}, ${esc(legal.owner)}, ${esc(legal.address)}, ${esc(legal.city)} · ${esc(legal.email)}</div>
    </section>`)
  }));

  write(path.join(outDir,"agb.html"), pageShell({
    title:"AGB – Wissens‑Bank",
    description:"AGB der Wissens‑Bank.",
    canonical:"/agb.html",
    ogImage:"/api/og?title=AGB&subtitle=Wissens‑Bank",
    body:chrome(`<section class="card pad">
      <div class="kicker">AGB</div>
      <div class="h1" style="font-size:34px">Allgemeine Geschäftsbedingungen</div>
      <p class="p muted">Digitaler Service (KI‑Leseführung). Keine Volltexte, nur Index + Links. Premiumzugang nach Zahlung (falls aktiviert).</p>
    </section>`)
  }));

  ensureDir(path.join(outDir,"q"));
  for (const q of unique){
    const slug = slugify(q);
    ensureDir(path.join(outDir,"q",slug));
    let top=[];
    try{ top = await fetchRssTop(q, 5); }catch{ top=[]; }
    const preview = top.length ? top.map(it=>`
      <div class="story">
        <a class="title" href="${esc(it.link)}" target="_blank" rel="noreferrer">${esc(it.title)}</a>
        <div class="meta"><span>${esc(it.domain||"")}</span><span class="sep">·</span><span>${esc(it.date||"")}</span></div>
        <div class="p muted" style="margin-top:8px">${esc(it.snippet||"")}</div>
      </div>`).join("") : `<div class="muted">Keine Preview‑Treffer. Nutze Live‑KI.</div>`;

    const page = chrome(`
      <section class="card pad" id="qpage" data-query="${esc(q)}">
        <div class="kicker">Topic</div>
        <div class="h1" style="font-size:38px">${esc(q)}</div>
        <p class="p muted">Statische Preview (SEO) + Live‑KI‑Recherche. Premium entsperrt Deep‑Summary.</p>
        <div class="hr"></div>
        <div class="kicker">Preview Quellen</div>
        ${preview}
        <div class="hr"></div>
        <div class="kicker">Live‑KI‑Preview</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
          <button class="btn primary" id="runLive">Jetzt laden</button>
          <a class="btn" href="/?q=${encodeURIComponent(q)}#search">Auf Startseite öffnen</a>
        </div>
        <div id="liveMount" style="margin-top:12px"></div>
      </section>
      <script type="module">
        const q = document.querySelector("#qpage")?.dataset?.query || "";
        const btn = document.querySelector("#runLive");
        btn?.addEventListener("click", async ()=>{
          const mount = document.querySelector("#liveMount");
          mount.innerHTML = '<div class="muted">Lade…</div>';
          try{
            const res = await fetch('/api/ai-search?q=' + encodeURIComponent(q), { cache:'no-store' });
            const data = await res.json();
            if(!res.ok) throw new Error(data?.error || 'Request failed');
            mount.innerHTML = '<div class="card pad"><div class="kicker">KI‑Preview</div><div class="p blur" style="white-space:pre-wrap">' + esc(data.teaser||data.summary||"") + '</div><div class="hr"></div><a class="btn primary" href="/#pricing">Premium entsperren</a></div>';
          }catch(e){
            mount.innerHTML = '<div class="card pad notice"><strong>Fehler:</strong> ' + esc(e.message) + '</div>';
          }
        });
        function esc(s){ return String(s||"").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
      </script>
    `);

    write(path.join(outDir,"q",slug,"index.html"), pageShell({
      title:`${q} – AI Newsroom`,
      description:`Topic: ${q}. Preview-Quellen + Live‑KI‑Leseführung.`,
      canonical:`/q/${slug}/`,
      ogImage:`/api/og?title=${encodeURIComponent(q)}&subtitle=AI%20Newsroom`,
      body:page
    }));
    urls.push(`/q/${slug}/`);
  }

  const lastmod = new Date().toISOString();
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
` +
    urls.map(u=>`  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join("
") +
    `
</urlset>
`;
  write(path.join(outDir,"sitemap.xml"), sitemap);
  write(path.join(outDir,"robots.txt"), `User-agent: *
Allow: /
Disallow: /api/
Sitemap: /sitemap.xml
`);
  console.log(`Build OK. Generated ${urls.length} URLs.`);
}

async function main(){
  if (CHECK_ONLY){ console.log("Check OK."); return; }
  await generate();
}
main().catch(err => { console.error(err); process.exit(1); });
