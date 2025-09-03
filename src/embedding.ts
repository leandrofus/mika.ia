import ollama from "ollama";

export async function embedText(text: string): Promise<number[]> {
  // console.log("Generando embedding para:", text);
  const res = await ollama.embeddings({
    model: "nomic-embed-text",
    prompt: text,
  });
  return res.embedding;
}
