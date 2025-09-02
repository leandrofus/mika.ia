import fs from "fs";
import path from "path";
import matter from "gray-matter";

const VAULT_PATH = process.env.VAULT_PATH || path.join(process.env.HOME || "", "obsidian", "test");
console.log("Vault path:", VAULT_PATH);

export function loadNotesByTag(tag: string) {
  const notes: { id: string; text: string; title?: string }[] = [];

  function readDir(dir: string) {
    console.log(`Leyendo directorio: ${dir}`);
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        console.log(`  Encontrado subdirectorio: ${file}`);
        readDir(fullPath); // recursion
      } else if (file.endsWith(".md")) {
        console.log(`  Procesando archivo: ${file}`);
        const content = fs.readFileSync(fullPath, "utf-8");
        const { data, content: body } = matter(content); // parse frontmatter

        if (data.tag === tag) {
          console.log(`    ✔ Coincidencia de tag: ${tag}`);
          notes.push({
            id: fullPath,
            text: body,
            title: data.title,
          });
        } else {
          console.log(`    ✖ Tag no coincide: ${data.tag}`);
        }
      } else {
        console.log(`  Ignorando archivo no Markdown: ${file}`);
      }
    }
  }

  readDir(VAULT_PATH);
  console.log(`Notas cargadas con tag "${tag}":`, notes.length);
  return notes;
}
