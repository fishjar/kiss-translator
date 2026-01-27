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
