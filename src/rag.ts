import { QdrantClient } from "@qdrant/js-client-rest";
import ollama from "ollama";
import { v4 as uuidv4 } from "uuid";

const COLLECTION = "notes";

export const qdrant = new QdrantClient({ url: "http://localhost:6333" });

// Inicializa o recrea la colección
export async function initCollection() {
  console.log("Inicializando colección:", COLLECTION);
  await qdrant.recreateCollection(COLLECTION, {
    vectors: { size: 768, distance: "Cosine" },
  });
  console.log("Colección inicializada.");
}

// Obtiene embedding de un texto usando Ollama
export async function embedText(text: string): Promise<number[]> {
  console.log("Generando embedding para:", text.slice(0, 50));
  const res = await ollama.embeddings({
    model: "nomic-embed-text",
    prompt: text,
  });
  return res.embedding;
}

// Inserta notas en Qdrant
export async function insertNotes(notes: { text: string; title?: string }[]) {
  if (!notes.length) {
    console.warn("No hay notas para insertar.");
    return;
  }

  const points = await Promise.all(
    notes.map(async (note) => ({
      id: uuidv4(), // ⚡ ID válido para Qdrant
      vector: await embedText(note.text),
      payload: { text: note.text, title: note.title },
    }))
  );

  console.log(`Insertando ${points.length} puntos en Qdrant...`);
  await qdrant.upsert(COLLECTION, {
    points,
    wait: true, // opcional, por defecto true
  });
  console.log("Notas insertadas correctamente.");
}

// Consulta RAG usando Qdrant y Ollama
export async function ragQuery(query: string) {
  console.log("Ejecutando consulta RAG:", query);
  const queryVector = await embedText(query);

  const results = await qdrant.search(COLLECTION, {
    vector: queryVector,
    limit: 3,
  });


  const context = results
    .map((r) => r.payload?.text)
    .filter(Boolean)
    .join("\n");

  const prompt = `
Devuelve únicamente un JSON con los siguientes campos: title, content:

Contexto:
${context}

Pregunta: ${query}
`;

  const response = await ollama.chat({
    model: "llama3.2:3b",
    messages: [{ role: "user", content: prompt }],
  });

  console.log("Respuesta generada.");
  return response.message.content;
}
