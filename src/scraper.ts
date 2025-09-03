import fetch from "node-fetch";
import { embedText } from "./embedding";
import * as cheerio from "cheerio";

export function cleanWikiHtml(html: string): string {
  const $ = cheerio.load(html);

  // 🔹 Eliminar elementos no deseados
  $(".mw-editsection").remove(); // [editar]
  $(".reference").remove(); // referencias [1]
  // $("table").remove(); // tablas (infoboxes, etc.)
  $("style").remove(); // CSS embebido
  $("script").remove(); // scripts
  $("sup").remove(); // superíndices (notas)
  $("span").removeAttr("style"); // inline CSS
  $("div").removeAttr("style");

  // 🔹 Obtener texto plano limpio
  const text = $.text();

  // 🔹 Normalizar espacios y saltos de línea
  return text.replace(/\s+/g, " ").trim();
}

interface WikipediaSummary {
  extract?: string;
  title?: string;
  description?: string;
}

interface WikipediaSummaryWithVector {
  title: string;
  text: string;
  vector: number[];
}

/**
 * Busca en Wikipedia (20 resultados máx) y devuelve extractos con embeddings.
 */
export async function scrapeWikipedia(query: string): Promise<WikipediaSummaryWithVector[] | null> {
  try {
    const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&utf8=1&srlimit=20`;
    console.log(searchUrl);
    
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;

    const searchData: any = await searchRes.json();
    const results = searchData.query?.search;
    if (!results || results.length === 0) return null;

    // Fetch de summaries (solo para elegir el mejor)
    const summaries = await Promise.all(
      results.map(async (r: any) => {
        try {
          const summaryUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            r.title
          )}`;
          console.log(summaryUrl);
          
          const summaryRes = await fetch(summaryUrl);
          if (!summaryRes.ok) return null;

          const summaryData: WikipediaSummary = await summaryRes.json();
          if (!summaryData.extract) return null;

          const vector = await embedText(summaryData.extract);
          return { title: r.title, text: summaryData.extract, vector };
        } catch {
          return null;
        }
      })
    );

    return summaries.filter((s): s is WikipediaSummaryWithVector => s !== null);
  } catch (err) {
    console.error("Error scrapeando Wikipedia:", err);
    return null;
  }
}

/**
 * Obtiene el artículo completo de Wikipedia (texto limpio).
 */
export async function fetchFullWikipediaPage(title: string): Promise<string | null> {
  try {
    const url = `https://es.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
      title
    )}&prop=text&format=json&origin=*`;
    console.log(url);
    
    const res = await fetch(url);
    if (!res.ok) return null;

    const data: any = await res.json();
    const html = data.parse?.text?.["*"];
    if (!html) return null;

    // limpiar HTML → texto plano

    const clean = cleanWikiHtml(html);
    return clean;

  } catch (err) {
    console.error("Error obteniendo artículo completo:", err);
    return null;
  }
}
