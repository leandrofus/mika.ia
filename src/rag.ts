// rag.ts
import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import ollama from "ollama";

// Nombre de la colección
export const COLLECTION = "notes";

// Inicializa cliente Qdrant
export const qdrant = new QdrantClient({ url: "http://localhost:6333" });

// -------------------------------------------------------------
// Inicializa o recrea la colección
export async function initCollection() {
  console.log("Inicializando colección:", COLLECTION);
  await qdrant.recreateCollection(COLLECTION, {
    vectors: { size: 768, distance: "Cosine" },
  });
  console.log("Colección inicializada.");
}

// -------------------------------------------------------------
// Inserta notas en Qdrant
export async function insertNotes(notes: { text: string; title?: string }[]) {
  if (!notes.length) {
    console.warn("No hay notas para insertar.");
    return;
  }

  // Función para generar embedding
  async function embedText(text: string): Promise<number[]> {
    console.log("Generando embedding para:", text.slice(0, 50));
    const res = await ollama.embeddings({
      model: "nomic-embed-text",
      prompt: text,
    });
    return res.embedding;
  }

  const points = await Promise.all(
    notes.map(async (note) => ({
      id: uuidv4(),
      vector: await embedText(note.text),
      payload: { text: note.text, title: note.title },
    }))
  );

  console.log(`Insertando ${points.length} puntos en Qdrant...`);
  await qdrant.upsert(COLLECTION, { points, wait: true });
  console.log("Notas insertadas correctamente.");
}