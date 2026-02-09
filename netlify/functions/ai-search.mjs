import { GoogleGenerativeAI } from "@google/generative-ai";
import { XMLParser } from "fast-xml-parser";

function json(statusCode, body){
  return {
    statusCode,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "access-control-allow-origin":"*",
      "cache-control":"no-store",
    },
    body: JSON.stringify(body),
  };
}

async function rssSources(q, limit=6){
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
    url: it?.link || "",
    date: toDate(it?.pubDate || it?.published || ""),
    domain: domainOf(it?.link || ""),
  })).filter(x => x.url && x.title);
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error:"Method not allowed" });

  const q = (event.queryStringParameters?.q || "").trim();
  if (!q) return json(400, { error:"Missing q" });

  const sources = await rssSources(q, 6).catch(()=>[]);
  const key = process.env.GEMINI_API_KEY;

  if (!key){
    return json(200, {
      ok: true,
      summary: "",
      teaser: "Demo‑Modus: GEMINI_API_KEY fehlt. Quellen‑Preview ist aktiv, KI‑Preview deaktiviert.",
      sources
    });
  }

  try{
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });

    const sourceList = sources.map((s,i)=>`${i+1}. ${s.title} (${s.domain}) – ${s.url}`).join("\n");
    const prompt = `Du bist ein nüchterner, faktischer Nachrichten-Analyst.\n\nUser Query: ${q}\n\nÖffentliche Quellen (nur Links, kein Volltext):\n${sourceList}\n\nAufgabe:\n- Kurze, faktische Preview (max 6 Sätze).\n- Keine Spekulation.\n- 4 Bulletpoints: Warum relevant / Worauf achten / Offene Fragen / Nächster Schritt.\n`;

    const out = await model.generateContent(prompt);
    const text = out?.response?.text?.() || "";

    return json(200, { ok:true, summary:text, teaser:text.slice(0, 900), sources });
  }catch(e){
    return json(200, {
      ok:true,
      summary:"",
      teaser:"KI konnte nicht antworten (Gemini Fehler). Quellen bleiben nutzbar.",
      sources
    });
  }
};
