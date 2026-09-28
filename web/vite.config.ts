import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE is where the page is served from: /Wanshah-Test/app/ on GitHub Pages, / on the server.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
