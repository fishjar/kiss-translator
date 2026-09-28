import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { patchOpencvCsp } from "./src/localAi/patchOpencvCsp";

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
    alias: {
      "@techstark/opencv-js": resolve(
        __dirname,
        "src/localAi/stubs/opencv-stub.ts"
      ),
    },
  },
  plugins: [patchOpencvCsp(), removeUnusedWasmPlugin()],
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
