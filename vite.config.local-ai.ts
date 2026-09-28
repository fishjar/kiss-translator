import { defineConfig } from "vite";
import { resolve } from "node:path";
import { patchOpencvCsp } from "./src/localAi/patchOpencvCsp";

export default defineConfig({
  publicDir: resolve(__dirname, "src/localAi/assets"),
  plugins: [patchOpencvCsp()],
  build: {
    outDir: resolve(__dirname, ".local-ai-build"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 15000,
    rollupOptions: {
      input: resolve(__dirname, "src/localAi/offscreen.ts"),
      output: {
        format: "es",
        entryFileNames: "offscreen.js",
        chunkFileNames: "local-ai/[name]-[hash].js",
        assetFileNames: "local-ai/[name]-[hash][extname]",
      },
    },
  },
});
