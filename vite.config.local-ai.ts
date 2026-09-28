import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { patchOpencvCsp } from "./src/localAi/patchOpencvCsp";
import { paddleBuild, paddleEntry } from "./src/localAi/paddleBuild";

// 自动拦截并剔除 onnxruntime-web 静态探测引起的未引用 asyncify.wasm（节省 25.5MB）
function removeUnusedWasmPlugin(): Plugin {
  return {
    name: "kiss-remove-unused-wasm",
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (
          fileName.includes("ort-wasm-simd-threaded.asyncify") &&
          fileName.endsWith(".wasm")
        ) {
          delete bundle[fileName];
          console.log(`[clean-assets] Removed unused wasm asset: ${fileName}`);
        }
      }
    },
  };
}

export default defineConfig({
  publicDir: resolve(__dirname, "src/localAi/assets"),
  resolve: {
    alias: [{ find: /^onnxruntime-web$/, replacement: "onnxruntime-web/webgpu" }],
  },
  plugins: [
    paddleBuild(),
    patchOpencvCsp(),
    removeUnusedWasmPlugin(),
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
