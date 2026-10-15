import { apiMicrosoftDict } from "../apis/index.js";
import { normalizeHoverLookupCloseDelay } from "./modes";
import { logger } from "../libs/log.js";
import { trustedTypesHelper } from "../libs/trustedTypes.js";
import {
  createFavoriteButton,
  saveFavoriteWordIfMissing,
} from "./favoriteWords.js";

/**
 * 动态向网页 document.head 中注入生词 hover 及详情气泡弹窗所需的 CSS 样式
 */
export const addWordHoverStyles = () => {
  // 如果已经注入过该样式表，直接返回，避免重复创建
  if (document.getElementById("kiss-word-hover-styles")) return;

  const style = document.createElement("style");
  style.id = "kiss-word-hover-styles";
  style.textContent = `
    /* 鼠标 hover 的单词样式：呈现下划线，指示可点击查词 */
    .kiss-word-hover {
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: #4fc3f7;
      text-decoration-thickness: 2px;
    }

    /* 查词气泡弹窗主体样式 */
    .kiss-word-tooltip {
      position: fixed;
      user-select: text;
      -webkit-user-select: text;
      pointer-events: auto;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-radius: 6px;
      padding: 12px;
      font-size: 14px;
      z-index: 2147483647;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: Arial, sans-serif;
    }

    /* 气泡弹窗头部（包含单词名和关闭按钮） */
    .kiss-word-tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: bold;
      font-size: 16px;
      color: #4fc3f7;
    }

    /* 关闭气泡弹窗的 X 按钮 */
    .kiss-word-tooltip-close {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      margin-left: 10px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .kiss-word-tooltip-close:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }

    /* 释义加载中状态文案 */
    .kiss-word-loading {
      color: #bbb;
      font-style: italic;
    }

    /* 单词词性释义行 */
    .kiss-word-definition {
      margin: 4px 0;
    }

    /* 词性前缀标记（如 n. / v. 等） */
    .kiss-word-pos {
      color: #4fc3f7;
      font-weight: bold;
    }

    /* 音标字符样式 */
    .kiss-word-phonetic {
      color: #bbb;
      font-style: italic;
      margin-right: 10px;
    }

    /* 例句包裹区 */
    .kiss-word-example {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #444;
    }

    .kiss-word-example-title {
      font-weight: bold;
      margin-bottom: 5px;
    }

    /* 例句英文正文 */
    .kiss-word-example-sentence {
      margin-bottom: 3px;
    }

    /* 例句中文翻译 */
    .kiss-word-example-translation {
      color: #bbb;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
};

/**
 * 使用正则表达式，将英文字幕文本中的每一个独立英文单词（包括带单引号/撇号的如 it's）使用 span 标签包裹。
 *
 * @param {string} text - 原文字幕字符串
 * @returns {string} 替换为带 span 标签的 HTML 字符串
 */
export function wrapWordsWithSpans(text) {
  return String(text || "").replace(
    /\b([a-zA-Z]+(?:'[a-zA-Z]+)?)\b/g,
    '<span class="kiss-subtitle-word" data-word="$1">$1</span>'
  );
}

export class WordTooltipController {
  constructor({
    getVideoContainer,
    getTimestamp,
    autoFavWord = false,
    i18n = (key, defaultText = key) => defaultText,
    closeDelay = 2,
    onClose = () => {},
  }) {
    this.getVideoContainer = getVideoContainer;
    this.getTimestamp = getTimestamp;
    this.autoFavWord = autoFavWord;
    this.i18n = i18n;
    this.closeDelayMs = normalizeHoverLookupCloseDelay(closeDelay) * 1000;
    this.onClose = onClose;
    this.tooltipEl = null;
    this.openTimeout = null;
    this.closeTimeout = null;
    this.activeWordEl = null;
    this.currentWord = null;
    this.inTooltip = false;
    this.destroyed = false;
    this.listeners = new AbortController();
    this.attachedSpans = new WeakSet();
    document.addEventListener(
      "fullscreenchange",
      () => {
        if (this.isOpen)
          (document.fullscreenElement || document.body).appendChild(
            this.tooltipEl
          );
      },
      { signal: this.listeners.signal }
    );
  }

  get isOpen() {
    return !!this.tooltipEl?.isConnected;
  }

  get isPanelInteractionActive() {
    return this.isOpen && (this.inTooltip || this.closeTimeout !== null);
  }

  attachSpanListeners(root, getTimestamp = this.getTimestamp) {
    if (!root || this.destroyed) return;
    root.querySelectorAll(".kiss-subtitle-word").forEach((span) => {
      if (this.attachedSpans.has(span)) return;
      span.addEventListener(
        "pointerenter",
        (event) => this.#handleWordHover(event, getTimestamp),
        { signal: this.listeners.signal }
      );
      span.addEventListener(
        "pointerleave",
        (event) => this.#handleWordHoverOut(event),
        { signal: this.listeners.signal }
      );
      this.attachedSpans.add(span);
    });
  }

  destroy() {
    this.destroyed = true;
    this.listeners.abort();
    this.clearHoverState();
  }

  #cancelTimers() {
    clearTimeout(this.openTimeout);
    clearTimeout(this.closeTimeout);
    this.openTimeout = this.closeTimeout = null;
  }

  clearHoverState() {
    this.activeWordEl?.classList.remove("kiss-word-hover");
    this.activeWordEl = null;
    this.hideWordTooltip();
  }

  #handleWordHover(event, getTimestamp) {
    const target = event.currentTarget;
    this.#cancelTimers();
    this.activeWordEl?.classList.remove("kiss-word-hover");
    target.classList.add("kiss-word-hover");
    this.activeWordEl = target;
    if (this.isOpen && this.currentWord === target.dataset.word) return;
    this.openTimeout = setTimeout(() => {
      this.openTimeout = null;
      void this.showWordTooltip(target.dataset.word, {
        timestamp: getTimestamp?.() ?? 0,
      });
    }, 300);
  }

  #handleWordHoverOut(event) {
    const target = event.currentTarget;
    target.classList.remove("kiss-word-hover");
    if (this.activeWordEl === target) this.activeWordEl = null;
    this.#cancelTimers();
    if (
      event.relatedTarget instanceof Node &&
      this.tooltipEl?.contains(event.relatedTarget)
    )
      return;
    if (!this.isOpen || this.inTooltip) return;
    if (this.closeDelayMs === 0) this.hideWordTooltip(event.relatedTarget);
    else
      this.closeTimeout = setTimeout(
        () => this.hideWordTooltip(),
        this.closeDelayMs
      );
  }

  async showWordTooltip(word, { timestamp = 0 } = {}) {
    if (this.destroyed) return;
    this.#cancelTimers();
    this.tooltipEl?.remove();
    this.inTooltip = false;
    this.currentWord = word;
    this.tooltipEl = document.createElement("div");
    const tooltip = this.tooltipEl;
    const current = () =>
      !this.destroyed && this.tooltipEl === tooltip && tooltip.isConnected;
    tooltip.addEventListener(
      "pointerenter",
      () => {
        this.inTooltip = true;
        clearTimeout(this.closeTimeout);
        this.closeTimeout = null;
      },
      { signal: this.listeners.signal }
    );
    tooltip.addEventListener(
      "pointerleave",
      (event) => this.hideWordTooltip(event.relatedTarget),
      { signal: this.listeners.signal }
    );
    tooltip.addEventListener(
      "click",
      (event) => {
        if (event.target.closest(".kiss-word-tooltip-close")) {
          event.stopPropagation();
          this.hideWordTooltip();
        }
      },
      { signal: this.listeners.signal }
    );
    this.tooltipEl.className = "kiss-word-tooltip";
    this.tooltipEl.innerHTML = trustedTypesHelper.createHTML(
      `<div class="kiss-word-tooltip-header"><span>${word}</span><button class="kiss-word-tooltip-close" type="button">×</button></div><div class="kiss-word-loading">Looking up...</div>`
    );

    const videoContainer = this.getVideoContainer?.();
    if (videoContainer) {
      const containerRect = videoContainer.getBoundingClientRect();
      const tooltipWidth = 300;
      const tooltipHeight = 400;

      const left = containerRect.right - tooltipWidth - 45;
      const top = containerRect.top + 20;

      const maxLeft = window.innerWidth - tooltipWidth - 10;
      this.tooltipEl.style.left = Math.min(maxLeft, Math.max(10, left)) + "px";
      this.tooltipEl.style.top = Math.max(10, top) + "px";
      this.tooltipEl.style.maxWidth = tooltipWidth + "px";
      this.tooltipEl.style.maxHeight = tooltipHeight + "px";
      this.tooltipEl.style.overflow = "auto";
    }

    (document.fullscreenElement || document.body).appendChild(this.tooltipEl);

    try {
      const dictResult = await apiMicrosoftDict(word);
      if (!current()) return;
      const { phonetic, definition, examples } =
        this.#extractDictionaryData(dictResult);

      this.#dispatchAddWord({
        word,
        phonetic,
        definition,
        examples,
        timestamp,
      });
      const wordData = { timestamp, phonetic, definition, examples };
      const hasDictionaryResult = Boolean(
        dictResult && (dictResult.trs || dictResult.aus || dictResult.sentences)
      );
      if (this.autoFavWord && hasDictionaryResult) {
        await saveFavoriteWordIfMissing(word, wordData);
      }
      if (!current()) return;
      this.#renderDictionaryResult(word, dictResult, wordData);
    } catch (error) {
      if (!current()) return;
      logger.info("Dictionary lookup failed for word:", word, error);
      this.#dispatchAddWord({
        word,
        phonetic: "",
        definition: "",
        examples: [],
        timestamp,
      });

      if (this.tooltipEl) {
        this.tooltipEl.innerHTML =
          trustedTypesHelper.createHTML(`<div class="kiss-word-tooltip-header">
        <span>${word}</span>
        <button class="kiss-word-tooltip-close" type="button">×</button>
      </div>
      <div class="kiss-word-definition">Failed to load definition</div>`);
        this.#addFavoriteButton(word, { timestamp });
      }
    }
  }

  hideWordTooltip(relatedTarget = null) {
    this.#cancelTimers();
    const wasOpen = !!this.tooltipEl;
    this.tooltipEl?.remove();
    this.tooltipEl = null;
    this.currentWord = null;
    this.inTooltip = false;
    if (wasOpen && !this.destroyed) this.onClose({ relatedTarget });
  }

  #extractDictionaryData(dictResult) {
    let phonetic = "";
    if (dictResult && dictResult.aus) {
      const usPhonetic = dictResult.aus.find((au) => au.key === "美");
      if (usPhonetic && usPhonetic.phonetic) {
        phonetic = usPhonetic.phonetic;
      } else if (dictResult.aus.length > 0 && dictResult.aus[0].phonetic) {
        phonetic = dictResult.aus[0].phonetic;
      }
    }

    let definition = "";
    if (dictResult && dictResult.trs) {
      definition = dictResult.trs
        .slice(0, 3)
        .map((tr) => `${tr.pos ? tr.pos + " " : ""}${tr.def}`)
        .join("; ");
    }

    let examples = [];
    if (dictResult && dictResult.sentences) {
      examples = dictResult.sentences.slice(0, 2).map((sentence) => ({
        eng: sentence.eng,
        chs: sentence.chs,
      }));
    }

    return { phonetic, definition, examples };
  }

  #dispatchAddWord(detail) {
    document.dispatchEvent(new CustomEvent("kiss-add-word", { detail }));
  }

  #addFavoriteButton(word, data) {
    const header = this.tooltipEl?.querySelector(".kiss-word-tooltip-header");
    const closeButton = header?.querySelector(".kiss-word-tooltip-close");
    if (!header || !closeButton) return;

    header.insertBefore(
      createFavoriteButton({ word, data, i18n: this.i18n }),
      closeButton
    );
  }

  #renderDictionaryResult(word, dictResult, wordData) {
    if (
      dictResult &&
      (dictResult.trs || dictResult.aus || dictResult.sentences)
    ) {
      let content = `<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" type="button">×</button>
        </div>`;

      if (dictResult.aus && dictResult.aus.length > 0) {
        content += "<div>";
        dictResult.aus.forEach((au) => {
          if (au.phonetic) {
            content += `<span class="kiss-word-phonetic">${au.phonetic}</span>`;
          }
        });
        content += "</div>";
      }

      if (dictResult.trs) {
        dictResult.trs.slice(0, 3).forEach((tr) => {
          content += `<div class="kiss-word-definition">${tr.pos ? '<span class="kiss-word-pos">' + tr.pos + "</span> " : ""}${tr.def}</div>`;
        });
      }

      if (dictResult.sentences && dictResult.sentences.length > 0) {
        content += `<div class="kiss-word-example">
            <div class="kiss-word-example-title">例句</div>`;
        dictResult.sentences.slice(0, 2).forEach((sentence) => {
          content += `<div class="kiss-word-example-sentence">${sentence.eng}</div>
              <div class="kiss-word-example-translation">${sentence.chs}</div>`;
        });
        content += "</div>";
      }

      if (this.tooltipEl) {
        this.tooltipEl.innerHTML = trustedTypesHelper.createHTML(content);
        this.#addFavoriteButton(word, wordData);
      }
      return;
    }

    if (this.tooltipEl) {
      this.tooltipEl.innerHTML =
        trustedTypesHelper.createHTML(`<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" type="button">×</button>
        </div>
        <div class="kiss-word-definition">No definition found</div>`);
      this.#addFavoriteButton(word, wordData);
    }
  }
}
