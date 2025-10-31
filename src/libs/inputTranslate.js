import {
  DEFAULT_INPUT_RULE,
  DEFAULT_INPUT_SHORTCUT,
  OPT_LANGS_LIST,
  DEFAULT_API_SETTING,
} from "../config";
import { genEventName, removeEndchar, matchInputStr, sleep } from "./utils";
import { stepShortcutRegister } from "./shortcut";
import { apiTranslate } from "../apis";
import { createLoadingSVG } from "./svg";
import { logger } from "./log";

function isInputNode(node) {
  return node.nodeName === "INPUT" || node.nodeName === "TEXTAREA";
}

function isEditAbleNode(node) {
  return node.hasAttribute("contenteditable");
}

async function replaceContentEditableText(node, newText) {
  try {
    logger.debug("try replace editable 1: pasteEvent");

    node.focus();

    const selection = window.getSelection();
    if (!selection) throw new Error("window.getSelection() is not available.");

    const targetNode = node.querySelector("p") || node;
    const range = document.createRange();
    range.selectNodeContents(targetNode);
    selection.removeAllRanges();
    selection.addRange(range);

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", newText);

    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    node.dispatchEvent(pasteEvent);

    await sleep(50);
    if (node.innerText.trim() === newText) {
      return true;
    }

    throw new Error("Strategy 1 failed to replace text correctly.");
  } catch (error) {
    logger.debug("Strategy 1 Failed:", error.message);
  }

  try {
    logger.debug("try replace editable 2: execCommand");

    node.focus();

    const selection = window.getSelection();
    if (!selection) throw new Error("window.getSelection() is not available.");

    const targetNode = node.querySelector("p") || node;
    const range = document.createRange();
    range.selectNodeContents(targetNode);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("insertText", false, newText);

    await sleep(50);
    if (node.innerText.trim() === newText) {
      return true;
    }

    throw new Error("Strategy 2 failed to replace text correctly.");
  } catch (error) {
    logger.debug("Strategy 2 Failed:", error.message);
  }

  try {
    logger.debug("try replace editable 3: textContent");

    node.focus();

    const targetNode = node.querySelector("p") || node;
    const textSpan = targetNode.querySelector('span[data-lexical-text="true"]');

    if (textSpan) {
      textSpan.textContent = newText;
    } else {
      targetNode.textContent = newText;
    }

    node.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));

    await sleep(50);
    if (node.innerText.trim() === newText) {
      return true;
    }

    throw new Error("Strategy 3 failed to replace text correctly.");
  } catch (error) {
    logger.debug("Strategy 3 Failed:", error.message);
  }

  return false;
}

function getNodeText(node) {
  if (isInputNode(node)) {
    return node.value;
  }
  return node.innerText || node.textContent || "";
}

function addLoading(node, loadingId) {
  const rect = node.getBoundingClientRect();
  const div = document.createElement("div");
  div.id = loadingId;
  div.appendChild(createLoadingSVG());
  div.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        line-height: ${rect.height}px;
        text-align: center;
        z-index: 2147483647;
        pointer-events: none; /* 允许点击穿透 */
    `;
  document.body.appendChild(div);
}

function removeLoading(loadingId) {
  const div = document.getElementById(loadingId);
  if (div) div.remove();
}

/**
 * 输入框翻译
 */
export class InputTranslator {
  #config;
  #unregisterShortcut = null;
  #isEnabled = false;
  #triggerShortcut; // 用于缓存快捷键

  constructor({ inputRule = DEFAULT_INPUT_RULE, transApis = [] } = {}) {
    this.#config = { inputRule, transApis };

    const { triggerShortcut: initialTriggerShortcut } = this.#config.inputRule;
    if (initialTriggerShortcut && initialTriggerShortcut.length > 0) {
      this.#triggerShortcut = initialTriggerShortcut;
    } else {
      this.#triggerShortcut = DEFAULT_INPUT_SHORTCUT;
    }

    if (this.#config.inputRule.transOpen) {
      this.enable();
    }
  }

  /**
   * 启用输入翻译功能
   */
  enable() {
    if (this.#isEnabled || !this.#config.inputRule.transOpen) {
      return;
    }

    const { triggerCount, triggerTime } = this.#config.inputRule;
    this.#unregisterShortcut = stepShortcutRegister(
      this.#triggerShortcut,
      this.#handleTranslate.bind(this),
      triggerCount,
      triggerTime
    );

    this.#isEnabled = true;
    logger.info("Input Translator enabled.");
  }

  /**
   * 禁用输入翻译功能
   */
  disable() {
    if (!this.#isEnabled) {
      return;
    }
    if (this.#unregisterShortcut) {
      this.#unregisterShortcut();
      this.#unregisterShortcut = null;
    }
    this.#isEnabled = false;
    logger.info("Input Translator disabled.");
  }

  /**
   * 切换启用/禁用状态
   */
  toggle() {
    if (this.#isEnabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * 翻译核心逻辑
   * @private
   */
  async #handleTranslate() {
    let node = document.activeElement;
    if (!node) return;

    while (node.shadowRoot && node.shadowRoot.activeElement) {
      node = node.shadowRoot.activeElement;
    }

    if (!isInputNode(node) && !isEditAbleNode(node)) {
      return;
    }

    const { apiSlug, transSign, triggerCount } = this.#config.inputRule;
    let { fromLang, toLang } = this.#config.inputRule;

    let initText = getNodeText(node);

    if (
      this.#triggerShortcut.length === 1 &&
      this.#triggerShortcut[0].length === 1
    ) {
      initText = removeEndchar(
        initText,
        this.#triggerShortcut[0],
        triggerCount
      );
    }

    if (!initText.trim()) return;

    let text = initText;
    if (transSign) {
      const res = matchInputStr(text, transSign);
      if (res) {
        let lang = res[1];
        if (lang === "zh" || lang === "cn") lang = "zh-CN";
        else if (lang === "tw" || lang === "hk") lang = "zh-TW";

        if (lang && OPT_LANGS_LIST.includes(lang)) {
          toLang = lang;
        }
        text = res[2];
      }
    }

    const apiSetting =
      this.#config.transApis.find((api) => api.apiSlug === apiSlug) ||
      DEFAULT_API_SETTING;
    const loadingId = "kiss-loading-" + genEventName();

    try {
      addLoading(node, loadingId);

      const { trText, isSame } = await apiTranslate({
        text,
        fromLang,
        toLang,
        apiSetting,
      });

      const newText = trText?.trim() || "";
      if (!newText || isSame) return;

      if (isInputNode(node)) {
        node.value = newText;
        node.dispatchEvent(
          new Event("input", { bubbles: true, cancelable: true })
        );
      } else {
        const success = await replaceContentEditableText(node, newText);
        if (!success) {
          // todo: 提示可以黏贴
          logger.info("Replace editable text failed");
        }
      }
    } catch (err) {
      logger.info("Translate input error:", err);
    } finally {
      removeLoading(loadingId);
    }
  }

  /**
   * 更新配置
   */
  updateConfig({ inputRule, transApis }) {
    const wasEnabled = this.#isEnabled;
    if (wasEnabled) {
      this.disable();
    }

    if (inputRule) {
      this.#config.inputRule = inputRule;
    }
    if (transApis) {
      this.#config.transApis = transApis;
    }

    const { triggerShortcut: initialTriggerShortcut } = this.#config.inputRule;
    this.#triggerShortcut =
      initialTriggerShortcut && initialTriggerShortcut.length > 0
        ? initialTriggerShortcut
        : DEFAULT_INPUT_SHORTCUT;

    if (wasEnabled) {
      this.enable();
    }
  }
}
