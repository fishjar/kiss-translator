import {
  DEFAULT_INPUT_RULE,
  DEFAULT_INPUT_SHORTCUT,
  OPT_LANGS_LIST,
  DEFAULT_API_SETTING,
} from "../config";
import { genEventName, removeEndchar, matchInputStr } from "./utils";
import { stepShortcutRegister } from "./shortcut";
import { apiTranslate } from "../apis";
import { createLoadingSVG } from "./svg";
import { kissLog } from "./log";

function isInputNode(node) {
  return node.nodeName === "INPUT" || node.nodeName === "TEXTAREA";
}

function isEditAbleNode(node) {
  return node.hasAttribute("contenteditable");
}

function replaceContentEditableText(node, newText) {
  node.focus();
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);

  range.deleteContents();
  const textNode = document.createTextNode(newText);
  range.insertNode(textNode);

  selection.collapseToEnd();
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
    kissLog("Input Translator enabled.");
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
    kissLog("Input Translator disabled.");
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

      const [trText, isSame] = await apiTranslate({
        text,
        fromLang,
        toLang,
        apiSetting,
      });

      if (!trText || isSame) return;

      if (isInputNode(node)) {
        node.value = trText;
        node.dispatchEvent(
          new Event("input", { bubbles: true, cancelable: true })
        );
      } else {
        replaceContentEditableText(node, trText);
      }
    } catch (err) {
      kissLog("Translate input error:", err);
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
