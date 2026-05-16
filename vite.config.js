import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const htmlEntries = Object.fromEntries(
  readdirSync(projectRoot)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [
      file === "index.html" ? "index" : file.replace(/\.html$/, ""),
      resolve(projectRoot, file),
    ]),
);

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: htmlEntries,
    },
  },
});
