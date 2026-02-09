function esc(s=""){ return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function svg(title="Epstein Files", subtitle="AI Newsroom"){
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0b0d10"/>
      <stop offset="1" stop-color="#0f1319"/>
    </linearGradient>
    <linearGradient id="a" x1="0" x2="1">
      <stop offset="0" stop-color="#6dd6ff"/>
      <stop offset="1" stop-color="#ffcc66"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="240" cy="140" r="260" fill="#6dd6ff" opacity="0.08"/>
  <circle cx="1040" cy="90" r="240" fill="#ffcc66" opacity="0.08"/>
  <rect x="70" y="120" width="1060" height="390" rx="28" fill="rgba(255,255,255,0.04)" stroke="#1f2a3a"/>
  <text x="110" y="240" font-size="64" font-weight="900" fill="url(#a)" font-family="ui-sans-serif,system-ui">${esc(title)}</text>
  <text x="110" y="320" font-size="34" fill="#e9eef6" opacity="0.92" font-family="ui-sans-serif,system-ui">${esc(subtitle)}</text>
  <text x="110" y="420" font-size="22" fill="#97a3b6" font-family="ui-monospace,Menlo,Monaco,Consolas">dynamic OG · share-ready · cached</text>
</svg>`;
}

export const handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const title = qs.title || "Epstein Files";
  const subtitle = qs.subtitle || "AI Newsroom";
  return {
    statusCode: 200,
    headers: { "content-type":"image/svg+xml; charset=utf-8", "cache-control":"public, max-age=86400" },
    body: svg(title, subtitle)
  };
};
