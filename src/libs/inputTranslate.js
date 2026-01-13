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

// ==========================================
// 核心工具函数：DOM 查找与状态判断
// ==========================================

/**
 * 递归查找 Shadow DOM 深处的当前焦点元素
 * 解决 Gemini、Discord 等使用 Custom Elements 的网站无法识别焦点的问题
 */
function getDeepActiveElement() {
  let element = document.activeElement;
  while (element && element.shadowRoot && element.shadowRoot.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}

/**
 * 判断是否为可编辑区域
 * 兼容 input, textarea, 以及 contenteditable="true" 的 div/span
 */
function isEditableTarget(node) {
  if (!node) return false;

  // 1. 标准输入框
  const nodeName = node.nodeName?.toUpperCase();
  if (nodeName === "INPUT" || nodeName === "TEXTAREA") {
    return true;
  }

  // 2. 检查 contenteditable 属性 (HTML 属性或 DOM 属性)
  if (
    node.isContentEditable ||
    node.getAttribute("contenteditable") === "true"
  ) {
    return true;
  }

  // 3. 特殊处理：有些编辑器(如CodeMirror)本身没有 contenteditable，但在其内部
  // 这种情况通常由 getDeepActiveElement 解决，但做个双重保险
  return false;
}

/**
 * 获取节点文本
 */
function getNodeText(node) {
  const nodeName = node.nodeName?.toUpperCase();
  if (nodeName === "INPUT" || nodeName === "TEXTAREA") {
    return node.value || "";
  }
  // 对于 contenteditable，优先取 innerText (也就是视觉可见的文本)
  return node.innerText || node.textContent || "";
}

/**
 * 针对 React 等框架的特殊赋值
 * React 重写了 input 的 value setter，直接 .value = xx 经常无效
 * 需要调用原生原型链上的 setter
 */
function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    prototype,
    "value"
  )?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
}

// ==========================================
// 核心逻辑：智能替换文本
// ==========================================
async function smartReplaceText(node, newText) {
  node.focus();
  await sleep(10);

  // 判断是否为富文本编辑器 (X.com, Discord, Slack 等通常是 contenteditable 的 div/span)
  const isRichEditor =
    node.isContentEditable || node.getAttribute("contenteditable") === "true";

  // ------------------------------------------------
  // 步骤 1: 全选内容 (保持不变)
  // ------------------------------------------------
  // ... (保留你原有的 performSelectAll 代码) ...
  const performSelectAll = () => {
    // ... (你的原有代码)
    if (typeof node.select === "function") {
      node.select();
      return;
    }
    try {
      document.execCommand("selectAll", false, null);
    } catch (e) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.addRange(range);
    }
  };
  performSelectAll();
  await sleep(50);

  // ------------------------------------------------
  // 步骤 2: 针对富文本编辑器的优先策略 (Clipboard Paste)
  // ------------------------------------------------

  // 修改点：如果是富文本编辑器，优先使用 Paste 策略
  // 这种方式能触发 React/Slate/Draft.js 的内部数据更新
  if (isRichEditor) {
    try {
      logger.debug("Rich Editor detected: Priority Strategy (Clipboard Paste)");
      const dt = new DataTransfer();
      dt.setData("text/plain", newText);
      const pasteEvt = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
      });
      node.dispatchEvent(pasteEvt);

      // 给 React 一点时间去处理 Paste 事件
      await sleep(100);

      // 注意：Paste 处理通常是异步的，或者会清除选区
      // 这里可以检查内容，但如果不放心，可以不立即 return，
      // 而是让下面的逻辑作为 fallback (虽然 paste 几乎总是成功的)
      if (checkSuccess(node, newText)) return true;
    } catch (e) {
      logger.debug("Strategy Paste failed", e);
    }
  }

  // ------------------------------------------------
  // 步骤 3: 原有的 execCommand 策略 (降级 / 普通输入框)
  // ------------------------------------------------

  // === 策略 1: execCommand 'insertText' ===
  // 仅当非富文本编辑器，或者 Paste 失败时才执行
  try {
    const success = document.execCommand("insertText", false, newText);
    if (success) {
      await sleep(20);
      if (checkSuccess(node, newText)) return true;
    }
  } catch (e) {
    logger.debug("Strategy 1 (insertText) failed", e);
  }

  // ... (保留你原有的 Strategy 1.5, Strategy 2) ...

  // === 策略 2: 标准 Input 处理 (React/Vue 兼容) ===
  if (node.nodeName === "INPUT" || node.nodeName === "TEXTAREA") {
    try {
      setNativeValue(node, newText);
      return true;
    } catch (e) {
      logger.debug("Strategy 2 (Input Value) failed", e);
    }
  }

  // 原有的 Strategy 3 可以保留作为最后的兜底，或者因为上面已经前置了，这里可以删除

  return false;
}
// 辅助验证函数
function checkSuccess(node, targetText) {
  const currentText = getNodeText(node);
  // 只要包含了目标文本，就算成功 (避免因为前后空格导致判断失败)
  return currentText.includes(targetText.trim());
}

// ==========================================
// UI 辅助函数
// ==========================================

function addLoading(node, loadingId) {
  const rect = node.getBoundingClientRect();
  // 如果元素不可见或太小，简单容错
  if (rect.width === 0 || rect.height === 0) {
    // pass
  }

  const div = document.createElement("div");
  div.id = loadingId;
  div.appendChild(createLoadingSVG());

  div.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        min-width: 20px;
        width: ${rect.width || 100}px;
        height: ${rect.height || 30}px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        pointer-events: none;
        background: transparent;
    `;
  document.body.appendChild(div);
}

function removeLoading(loadingId) {
  const div = document.getElementById(loadingId);
  if (div) div.remove();
}

// ==========================================
// 主类：InputTranslator
// ==========================================

export class InputTranslator {
  #config;
  #unregisterShortcut = null;
  #isEnabled = false;
  #triggerShortcut;

  constructor({ inputRule = DEFAULT_INPUT_RULE, transApis = [] } = {}) {
    this.#config = { inputRule, transApis };

    // 初始化快捷键配置
    const { triggerShortcut: initialTriggerShortcut } = this.#config.inputRule;
    this.#triggerShortcut =
      initialTriggerShortcut && initialTriggerShortcut.length > 0
        ? initialTriggerShortcut
        : DEFAULT_INPUT_SHORTCUT;

    if (this.#config.inputRule.transOpen) {
      this.enable();
    }
  }

  enable() {
    if (this.#isEnabled || !this.#config.inputRule.transOpen) return;

    const { triggerCount, triggerTime } = this.#config.inputRule;
    this.#unregisterShortcut = stepShortcutRegister(
      this.#triggerShortcut,
      this.handleTranslate.bind(this),
      triggerCount,
      triggerTime
    );

    this.#isEnabled = true;
    logger.info("Input Translator enabled.");
  }

  disable() {
    if (!this.#isEnabled) return;
    if (this.#unregisterShortcut) {
      this.#unregisterShortcut();
      this.#unregisterShortcut = null;
    }
    this.#isEnabled = false;
    logger.info("Input Translator disabled.");
  }

  toggle() {
    this.#isEnabled ? this.disable() : this.enable();
  }

  async handleTranslate() {
    logger.debug("handle input translate");

    // 1. 获取真正的焦点元素 (关键修改)
    const node = getDeepActiveElement();

    // 2. 检查节点是否支持 (关键修改)
    if (!node || !isEditableTarget(node)) {
      logger.debug("Active node is not editable");
      return;
    }

    const { apiSlug, transSign, triggerCount } = this.#config.inputRule;
    let { fromLang, toLang } = this.#config.inputRule;

    // 3. 获取文本
    let initText = getNodeText(node);

    // 4. 处理触发字符逻辑
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

    // 5. 解析语言指令 (例如 "en:你好")
    let text = initText;
    if (transSign) {
      const res = matchInputStr(text, transSign);
      if (res) {
        let lang = res[1];
        // 简写映射
        const langMap = { zh: "zh-CN", cn: "zh-CN", tw: "zh-TW", hk: "zh-TW" };
        if (langMap[lang.toLowerCase()]) lang = langMap[lang.toLowerCase()];

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

      // 调用翻译 API
      const { trText, isSame } = await apiTranslate({
        text,
        fromLang,
        toLang,
        apiSetting,
      });

      const newText = trText?.trim() || "";
      if (!newText || isSame) return;

      // 6. 执行替换 (使用新的智能替换函数)
      const success = await smartReplaceText(node, newText);
      if (!success) {
        logger.warn("Text replacement failed after all strategies.");
        // 这里可以考虑显示一个 Toast 提示用户手动粘贴
      }
    } catch (err) {
      logger.error("Translate input error:", err);
    } finally {
      removeLoading(loadingId);
    }
  }

  updateConfig({ inputRule, transApis }) {
    const wasEnabled = this.#isEnabled;
    if (wasEnabled) this.disable();

    if (inputRule) this.#config.inputRule = inputRule;
    if (transApis) this.#config.transApis = transApis;

    const { triggerShortcut } = this.#config.inputRule;
    this.#triggerShortcut =
      triggerShortcut && triggerShortcut.length > 0
        ? triggerShortcut
        : DEFAULT_INPUT_SHORTCUT;

    if (wasEnabled) this.enable();
  }
}
