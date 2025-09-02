import express from "express";
import bodyParser from "body-parser";
import { initCollection, insertNotes, ragQuery } from "./rag";
import { loadNotesByTag } from "./obsidian";
import path from "path";

// Servir archivos estáticos
const app = express();
app.use(express.static(path.join(__dirname, "../public")));
app.use(bodyParser.json());

app.post("/rag", async (req, res) => {
  try {
    const { query, tag } = req.body;

    // Cargar notas de Obsidian con el tag
    const notes = loadNotesByTag(tag);

    // Inicializar Qdrant + cargar notas
    await initCollection();
    await insertNotes(notes);

    // Ejecutar RAG
    const answer = await ragQuery(query);

    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error procesando consulta" });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Servidor RAG corriendo en http://localhost:${PORT}`);
});
