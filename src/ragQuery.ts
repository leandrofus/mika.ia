import fs from "fs";
import path from "path";
import { qdrant, COLLECTION, insertDocument } from "./qdrant";
import { embedText } from "./embedding";
import ollama from "ollama";
import { fetchFullWikipediaPage, scrapeWikipedia } from "./scraper";
import { loadNotesByTag } from "./obsidian";
import { encode, decode } from "gpt-3-encoder";

// =================== Helpers ===================
export function chunkTextByTokens(text: string, maxTokens = 500, overlapTokens = 50): string[] {
  if (overlapTokens >= maxTokens) throw new Error("overlapTokens debe ser menor que maxTokens");
  const tokens = encode(text);
  const chunks: string[] = [];

  for (let i = 0; i < tokens.length; i += maxTokens - overlapTokens) {
    const slice = tokens.slice(i, i + maxTokens);
    chunks.push(decode(slice));
  }

  console.log(`[DEBUG] Total chunks generados: ${chunks.length}`);
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

function truncateText(text: string, maxLength = 1500): string {
  return text.length <= maxLength ? text : text.slice(0, maxLength) + "...";
}

function saveChunksToFile(chunks: string[], query: string) {
  const filename = path.join(__dirname, `rag_chunks_${query.replace(/\s+/g, "_")}.txt`);
  fs.writeFileSync(filename, chunks.join("\n\n"), { encoding: "utf-8" });
  console.log(`[DEBUG] Chunks guardados en archivo: ${filename}`);
}

// =================== RAG Query ===================
export async function ragQuery(query: string, tag?: string) {
  console.log("[DEBUG] Iniciando RAG query para:", query);

  // 1️⃣ Cargar notas locales
  const notes = tag ? loadNotesByTag(tag) : [];
  console.log(`[DEBUG] Notas locales encontradas: ${notes.length}`);

  for (const note of notes) {
    const vector = await embedText(note.text);
    console.log("[DEBUG] Embedding generado para nota:", note.title || "Sin título", "Vector length:", vector.length);
    await insertDocument(note.title || "Sin título", note.text, vector);
    console.log("[DEBUG] Nota insertada:", truncateText(note.text, 100));
  }

  // 2️⃣ Scraping de Wikipedia
  const wikiResults = await scrapeWikipedia(query);
  console.log("[DEBUG] Resultados Wikipedia encontrados:", wikiResults?.length || 0);

  let queryVector: number[] | undefined;

  if (wikiResults?.length) {
    if (!queryVector) {
      queryVector = await embedText(query);
      console.log("[DEBUG] Embedding de query generado, length:", queryVector.length);
    }

    wikiResults.sort((a, b) => cosineSimilarity(b.vector, queryVector!) - cosineSimilarity(a.vector, queryVector!));
    const bestWiki = wikiResults[0];
    console.log("[DEBUG] Mejor artículo Wikipedia:", bestWiki.title);

    const fullArticle = await fetchFullWikipediaPage(bestWiki.title);
    if (fullArticle) {
      const chunks = chunkTextByTokens(fullArticle, 500, 50);
      saveChunksToFile(chunks, query);

      for (const chunk of chunks) {
        const vector = await embedText(chunk);
        console.log("[DEBUG] Embedding generado para chunk Wikipedia, length:", vector.length);
        await insertDocument(bestWiki.title, chunk, vector);
        console.log("[DEBUG] Chunk insertado:", truncateText(chunk, 100));
      }
    }
  }

  // 3️⃣ Embedding de la query si no se generó antes
  if (!queryVector) {
    queryVector = await embedText(query);
    console.log("[DEBUG] Embedding de query generado (fuera de Wikipedia), length:", queryVector.length);
  }

  // 4️⃣ Buscar documentos relevantes en Qdrant
  const results = await qdrant.search(COLLECTION, {
    vector: queryVector,
    limit: 5
  });

  const relevantChunks = results
    .sort((a, b) => b.score - a.score)
    .filter(r => r.score > 0.3)
    .map(r => r.payload?.text)
    .filter(Boolean)
    .slice(0, 5); // aumentar top chunks para más contexto

  // 5️⃣ Preparar contexto para el prompt
  const truncatedContext = relevantChunks.map((chunk: any) => truncateText(chunk, 500)).join("\n\n");
  console.log("[DEBUG] Contexto final seleccionado para prompt (primeros 200 chars):", truncatedContext.slice(0, 200));

  const prompt = `
imagina una historia con este contexto:
  Contexto:
${truncatedContext}

Pregunta: ${query}
`;

  console.log("[DEBUG] Prompt enviado a Ollama (primeros 500 chars):", prompt.slice(0, 500));

  // 6️⃣ Llamada a Ollama
  const response = await ollama.chat({
    model: "mistral:latest",
    messages: [{ role: "user", content: prompt }],
    options: {
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    },

  });

  console.log("[DEBUG] Respuesta recibida de Ollama (primeros 500 chars):", response.message.content.slice(0, 500));

  // 7️⃣ Retornar la respuesta cruda junto con el prompt
  return {
    answer: {
      title: query,
      content: response.message.content
    },
    prompt
  };
}
