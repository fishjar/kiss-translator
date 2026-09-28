import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { preparePaddleAssets } from "../scripts/paddle-assets.mjs";
import { patchCspCode } from "./patchOpencvCsp";

export const paddleDirectory = resolve("tmp/paddleocr-0.4.2");
export const paddleEntry = resolve(paddleDirectory, "src/pipelines/ocr/worker-entry.ts");

export function paddleBuild(): Plugin {
  return {
    name: "kiss-pinned-paddle-worker",
    enforce: "pre",
    async buildStart() {
      await preparePaddleAssets(paddleDirectory);
    },
    resolveId(id, importer) {
      if (id === "@techstark/opencv-js") {
        return importer?.replaceAll("\\", "/").includes("/tmp/paddleocr-0.4.2/")
          ? resolve(paddleDirectory, "opencv.js")
          : resolve("src/localAi/stubs/opencv-stub.ts");
      }
      if (importer?.replaceAll("\\", "/").includes("/tmp/paddleocr-0.4.2/")) {
        if (id === "js-yaml") return resolve(paddleDirectory, "js-yaml.mjs");
        if (id === "clipper-lib") return resolve(paddleDirectory, "clipper.cjs");
        if (["fs", "path", "crypto"].includes(id)) return "\0paddle-node-stub";
      }
    },
    load(id) {
      if (id === "\0paddle-node-stub") return "export default {};";
      if (id === resolve(paddleDirectory, "opencv.js")) {
        const code = patchCspCode(readFileSync(id, "utf8"));
        if (code.includes("new Function(")) throw new Error("Unpatched OpenCV source");
        return code;
      }
    },
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/@paddleocr/paddleocr-js/dist/index.mjs")) return;
      const original = 'new URL("./assets/worker-entry-C9UNuyOJ.js", import.meta.url)';
      if (code.split(original).length !== 2) throw new Error("PaddleOCR default worker entry changed");
      return { code: code.replace(original, 'new URL("./local-ai/ocr-worker.js", globalThis.location.href)'), map: null };
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "local-ai/PADDLE-NOTICE.txt", source: readFileSync(resolve(paddleDirectory, "NOTICE.txt")) });
    },
  };
}
