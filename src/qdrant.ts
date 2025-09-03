import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";

export const COLLECTION = "notes";

export const qdrant = new QdrantClient({ url: "http://localhost:6333" });

export async function initCollection() {
  console.log("Inicializando colección:", COLLECTION);
  await qdrant.recreateCollection(COLLECTION, {
    vectors: { size: 768, distance: "Cosine" },
  });
  console.log("Colección inicializada.");
}

export async function insertDocument(title: string, text: string, vector: number[]) {
  await qdrant.upsert(COLLECTION, {
    points: [
      { id: uuidv4(), vector, payload: { title, text } }
    ],
    wait: true
  });
}
