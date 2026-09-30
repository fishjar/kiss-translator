import { defineConfig } from "vite";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { patchOpencvCsp } from "./src/localAi/patchOpencvCsp";
import { paddleBuild, paddleEntry } from "./src/localAi/paddleBuild";

export default defineConfig({
  publicDir: resolve(__dirname, "src/localAi/assets"),
  resolve: {
    alias: [{ find: /^onnxruntime-web$/, replacement: "onnxruntime-web/webgpu" }],
  },
  plugins: [
    paddleBuild(),
    patchOpencvCsp(),
    {
      name: "kiss-module-report",
      writeBundle(options, bundle) {
        const modules = Object.values(bundle)
          .filter((item) => item.type === "chunk")
          .map((item) => ({
            file: item.fileName,
            imports: item.imports,
            dynamicImports: item.dynamicImports,
            modules: Object.entries(item.modules).map(([id, info]) => ({
              id,
              bytes: info.renderedLength,
            })),
          }));
        mkdirSync(options.dir!, { recursive: true });
        writeFileSync(
          resolve(options.dir!, ".modules.json"),
          JSON.stringify(modules, null, 2)
        );
      },
    },
  ],
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        entryFileNames: "local-ai/[name]-[hash].js",
        chunkFileNames: "local-ai/[name]-[hash].js",
        assetFileNames: "local-ai/[name]-[hash][extname]",
      },
    },
  },
  build: {
    commonjsOptions: { include: [/node_modules/, /paddleocr-0\.4\.2[\\/]clipper\.cjs$/] },
    outDir: resolve(__dirname, ".local-ai-build"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 15000,
    rollupOptions: {
      input: {
        offscreen: resolve(__dirname, "src/localAi/offscreen.ts"),
        "ocr-worker": paddleEntry,
        ...Object.fromEntries(
          ["asr", "jev", "llm", "llm-onnx", "tts"].map((name) => [
            `${name}-worker`,
            resolve(__dirname, `src/localAi/workers/${name}-worker.ts`),
          ])
        ),
      },
      output: {
        format: "es",
        entryFileNames: (chunk) =>
          chunk.name === "offscreen" ? "offscreen.js" : "local-ai/[name].js",
        chunkFileNames: "local-ai/[name]-[hash].js",
        assetFileNames: "local-ai/[name]-[hash][extname]",
      },
    },
  },
});
