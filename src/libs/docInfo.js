import { truncateWords } from "./utils";

// 清洗文本，移除换行符
const cleanText = (text) => {
  if (!text) return "";
  return text.trim().replace(/\s+/g, " ");
};

const getTitle = () => {
  try {
    return truncateWords(cleanText(document.title));
  } catch (err) {
    return "";
  }
};

const getDescription = () => {
  try {
    const meta = document.querySelector('meta[name="description"]');
    const description = meta?.getAttribute("content") || "";
    return truncateWords(cleanText(description));
  } catch (err) {
    return "";
  }
};

/**
 * 获取网页的总结信息以供 AI 翻译提供更精准的领域上下文
 * // REVIEW: 大文本正则清洗 CPU 性能开销。
 * // 在 `getSummary()` 获取 YouTube 等特殊站点的视频详情或描述区域（如 `#description-inline-expander`）时，
 * // 该节点的 `textContent` 长度可能极其庞大。
 * // 此时立即对其运行 `cleanText` 中的全局正则替换 `replace(/\s+/g, " ")` 会在主线程产生明显的 CPU 计算阻塞，
 * // 推荐先对文本进行字符截断（如 slice()）限制最大长度后，再执行正则空白符清洗。
 */
const getSummary = () => {
  // todo: 利用AI总结
  let summary = "";

  try {
    const href = document?.location?.href || "";
    const youtubeUrl = "https://www.youtube.com";
    if (href.startsWith(youtubeUrl)) {
      // YouTube specific logic
      const $el =
        document.querySelector("#collapsed-title") ||
        document.querySelector("#description-inline-expander"); // 尝试更多可能的选择器
      if ($el) {
        summary = $el.textContent;
      }
    }

    // 尝试获取通用 Meta 信息作为兜底
    if (!summary) {
      summary =
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content") || "";
    }
    if (!summary) {
      summary =
        document
          .querySelector('meta[name="keywords"]')
          ?.getAttribute("content") || "";
    }
  } catch (err) {
    // ignore
  }

  return truncateWords(cleanText(summary));
};

export const getDocInfo = () => {
  const title = getTitle();
  const description = getDescription();
  const summary = getSummary();

  const info = { title, description, summary };

  return info;
};
