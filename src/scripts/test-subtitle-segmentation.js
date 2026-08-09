// Babel CLI 不会像 React 构建器自动加载 .env，先补齐配置模块依赖的应用变量。
import "dotenv/config";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  prepareTimedTextEvents,
  runBuiltinSegmentation,
} from "../subtitle/youtubeSubtitleProcessing.js";
import {
  buildSegmentationMetrics,
  getSegmentationMetricErrors,
} from "../subtitle/subtitleSegmentationMetrics.js";
import { buildBilingualVtt } from "../subtitle/vtt.js";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const SAMPLE_ROOT = path.join(PROJECT_ROOT, "testdata/subtitle-samples");
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "tmp/subtitle-segmentation");

/** 解析 `--name=value` 和 `--name value` 两种命令行参数。 */
function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    result[rawName] =
      inlineValue === undefined && argv[index + 1]?.startsWith("--") === false
        ? argv[++index]
        : (inlineValue ?? true);
  }
  return result;
}

/** 使用文件内容和索引元数据验证本地样本未被意外修改。 */
function validateSampleFile(sample, data) {
  const digest = crypto.createHash("sha256").update(data).digest("hex");
  if (data.length !== sample.size || digest !== sample.sha256) {
    throw new Error(`字幕样本校验失败: ${sample.id}`);
  }
}

/** 将 JSON 以统一格式写入测试产物目录，便于代码审查和人工比较。 */
const writeJson = (filePath, value) =>
  fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

/** 对有序字幕边界生成稳定签名，用于发现规则升级造成的黄金边界变化。 */
function getBoundarySignature(cues) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        (cues || []).map(({ start, end, text }) => [start, end, text])
      )
    )
    .digest("hex")
    .slice(0, 16);
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const catalog = JSON.parse(
    await fs.readFile(path.join(SAMPLE_ROOT, "index.json"), "utf8")
  );
  const selectedSamples = catalog.samples.filter(
    (sample) =>
      !args.sample || args.sample === "all" || sample.id === args.sample
  );
  if (!selectedSamples.length) {
    throw new Error(`没有找到字幕样本: ${args.sample}`);
  }

  const modes =
    !args.mode || args.mode === "all" ? ["rule", "statistical"] : [args.mode];
  if (modes.some((mode) => !["rule", "statistical"].includes(mode))) {
    throw new Error(`不支持的断句模式: ${args.mode}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(OUTPUT_ROOT, timestamp);
  await fs.mkdir(outputDir, { recursive: true });
  const summary = [];
  let hasStructuralErrors = false;

  for (const sample of selectedSamples) {
    const sourceBuffer = await fs.readFile(path.join(SAMPLE_ROOT, sample.path));
    validateSampleFile(sample, sourceBuffer);
    const sourceValue = JSON.parse(sourceBuffer.toString("utf8"));
    const rawEvents = Array.isArray(sourceValue)
      ? sourceValue
      : sourceValue.events;
    const fromLang = args.lang || sourceValue.lang || sample.language || "auto";
    const sampleDir = path.join(outputDir, sample.id);
    await fs.mkdir(sampleDir, { recursive: true });

    const { events, flatEvents, filteredNonSpeechCount } =
      prepareTimedTextEvents(rawEvents);
    await writeJson(path.join(sampleDir, "raw.json"), sourceValue);
    await writeJson(path.join(sampleDir, "flat-events.json"), flatEvents);

    const sampleMetrics = {};
    for (const mode of modes) {
      const startedAt = performance.now();
      const cues = runBuiltinSegmentation({
        events,
        flatEvents,
        fromLang,
        mode,
        longSentenceThreshold: Number(args["long-sentence-threshold"]) || 100,
      });
      const metrics = buildSegmentationMetrics({
        rawEvents,
        canonicalEvents: events,
        flatEvents,
        cues,
        fromLang,
        processingMs: performance.now() - startedAt,
        filteredNonSpeechCount,
      });
      const errors = getSegmentationMetricErrors(metrics);
      const boundarySignature = getBoundarySignature(cues);
      const expectedSignature = sample.goldenBoundaries?.[mode];
      if (expectedSignature && expectedSignature !== boundarySignature) {
        errors.push("golden-boundary-changed");
      }
      sampleMetrics[mode] = { ...metrics, boundarySignature, errors };
      hasStructuralErrors ||= errors.length > 0;

      await writeJson(path.join(sampleDir, `${mode}.json`), cues);
      await fs.writeFile(
        path.join(sampleDir, `${mode}.vtt`),
        `${buildBilingualVtt(cues)}\n`,
        "utf8"
      );
    }

    await writeJson(path.join(sampleDir, "metrics.json"), sampleMetrics);
    summary.push({
      id: sample.id,
      language: fromLang,
      rawEventCount: rawEvents.length,
      flatEventCount: flatEvents.length,
      filteredNonSpeechCount,
      modes: sampleMetrics,
    });
  }

  await writeJson(path.join(outputDir, "summary.json"), summary);
  console.table(
    summary.flatMap((sample) =>
      Object.entries(sample.modes).map(([mode, metrics]) => ({
        sample: sample.id,
        mode,
        cues: metrics.cueCount,
        filtered: metrics.filteredNonSpeechCount,
        coverage: `${metrics.textCoveragePercent}%`,
        errors: metrics.errors.join(",") || "-",
      }))
    )
  );
  console.log(`字幕断句测试结果: ${outputDir}`);
  if (hasStructuralErrors) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
