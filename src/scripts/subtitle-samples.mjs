import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 读取并校验字幕样本索引，确保发布和 CLI 使用的是同一份可靠数据。
 */
export async function validateSubtitleSampleCatalog(
  projectRoot = process.cwd()
) {
  const sampleRoot = path.resolve(projectRoot, "testdata/subtitle-samples");
  const indexPath = path.join(sampleRoot, "index.json");
  const catalog = JSON.parse(await fs.readFile(indexPath, "utf8"));

  if (catalog?.version !== 1 || !Array.isArray(catalog.samples)) {
    throw new Error("字幕样本索引格式无效");
  }

  for (const sample of catalog.samples) {
    // 视频链接允许留空，但字段必须存在，保证 Web 与 CLI 读取同一套索引结构。
    if (typeof sample.videoUrl !== "string") {
      throw new Error(`字幕样本缺少视频链接字段: ${sample.id}`);
    }

    // 禁止索引路径逃逸到样本目录以外，避免构建时误复制其他项目文件。
    const samplePath = path.resolve(sampleRoot, sample.path || "");
    if (!samplePath.startsWith(`${sampleRoot}${path.sep}`)) {
      throw new Error(`字幕样本路径越界: ${sample.path}`);
    }

    const data = await fs.readFile(samplePath);
    const digest = crypto.createHash("sha256").update(data).digest("hex");
    if (data.length !== sample.size || digest !== sample.sha256) {
      throw new Error(`字幕样本校验失败: ${sample.id}`);
    }

    // 在构建阶段提前验证 JSON，避免把损坏的样本发布到 Web 页面。
    const parsed = JSON.parse(data.toString("utf8"));
    const events = Array.isArray(parsed) ? parsed : parsed?.events;
    if (!Array.isArray(events)) {
      throw new Error(`字幕样本不是有效的事件数组: ${sample.id}`);
    }
  }

  return { catalog, sampleRoot };
}

/**
 * 只把样本复制到 Web 构建，浏览器扩展和用户脚本发布包不会包含这些文件。
 */
export async function copySubtitleSamplesToWeb(
  webBuildDir,
  projectRoot = process.cwd()
) {
  const { sampleRoot } = await validateSubtitleSampleCatalog(projectRoot);
  const destination = path.resolve(webBuildDir, "subtitle-samples");
  await fs.cp(sampleRoot, destination, { recursive: true });
}
