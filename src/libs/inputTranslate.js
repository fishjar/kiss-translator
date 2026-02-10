import {
  DEFAULT_INPUT_RULE,
  DEFAULT_INPUT_SHORTCUT,
  OPT_LANGS_LIST,
  DEFAULT_API_SETTING,
  OPT_INPUT_DOT_DISABLE,
  OPT_INPUT_DOT_MOBILE,
} from "../config";
import { isMobile } from "./mobile";
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
  // 步骤 1: 全选内容
  // ------------------------------------------------
  const performSelectAll = () => {
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

      if (checkSuccess(node, newText)) return true;
    } catch (e) {
      logger.debug("Strategy Paste failed", e);
    }
  }

  // ------------------------------------------------
  // 步骤 3: 原有的 execCommand 策略 (降级 / 普通输入框)
  // ------------------------------------------------
  try {
    const success = document.execCommand("insertText", false, newText);
    if (success) {
      await sleep(20);
      if (checkSuccess(node, newText)) return true;
    }
  } catch (e) {
    logger.debug("Strategy 1 (insertText) failed", e);
  }

  // === 策略 2: 标准 Input 处理 (React/Vue 兼容) ===
  if (node.nodeName === "INPUT" || node.nodeName === "TEXTAREA") {
    try {
      setNativeValue(node, newText);
      return true;
    } catch (e) {
      logger.debug("Strategy 2 (Input Value) failed", e);
    }
  }

  return false;
}

// 辅助验证函数
function checkSuccess(node, targetText) {
  const currentText = getNodeText(node);
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

  // 状态管理
  #activeInput = null; // 当前获得焦点的输入框
  #floatBtn = null; // 悬浮按钮 DOM
  #resizeObserver = null; // 监听输入框尺寸变化
  #blurTimer = null; // 存储失焦隐藏的定时器 ID

  // 绑定的事件处理函数
  #boundFocusIn;
  #boundFocusOut;
  #boundUpdatePos;

  constructor({ inputRule = DEFAULT_INPUT_RULE, transApis = [] } = {}) {
    this.#config = { inputRule, transApis };

    const { triggerShortcut: initialTriggerShortcut } = this.#config.inputRule;
    this.#triggerShortcut =
      initialTriggerShortcut && initialTriggerShortcut.length > 0
        ? initialTriggerShortcut
        : DEFAULT_INPUT_SHORTCUT;

    this.#boundFocusIn = this.handleFocusIn.bind(this);
    this.#boundFocusOut = this.handleFocusOut.bind(this);
    this.#boundUpdatePos = this.updateBtnPosition.bind(this);

    if (this.#config.inputRule.transOpen) {
      this.enable();
    }
  }

  enable() {
    if (this.#isEnabled) return; // 避免重复开启

    // 1. 注册快捷键
    const { triggerCount, triggerTime } = this.#config.inputRule;
    this.#unregisterShortcut = stepShortcutRegister(
      this.#triggerShortcut,
      this.handleTranslate.bind(this),
      triggerCount,
      triggerTime
    );

    // 2. 注册 DOM 监听
    document.addEventListener("focusin", this.#boundFocusIn);
    document.addEventListener("focusout", this.#boundFocusOut);
    window.addEventListener("scroll", this.#boundUpdatePos, true);
    window.addEventListener("resize", this.#boundUpdatePos);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this.#boundUpdatePos);
      window.visualViewport.addEventListener("scroll", this.#boundUpdatePos);
    }

    this.#isEnabled = true;

    // [修复问题2-B]：开启时，如果当前焦点已经在输入框内，立即触发逻辑
    const currentFocus = getDeepActiveElement();
    if (isEditableTarget(currentFocus)) {
      this.handleFocusIn();
    }

    logger.info("Input Translator enabled.");
  }

  disable() {
    if (!this.#isEnabled) return;

    // 1. 移除快捷键
    if (this.#unregisterShortcut) {
      this.#unregisterShortcut();
      this.#unregisterShortcut = null;
    }

    // 2. 移除 DOM 监听
    document.removeEventListener("focusin", this.#boundFocusIn);
    document.removeEventListener("focusout", this.#boundFocusOut);
    window.removeEventListener("scroll", this.#boundUpdatePos, true);
    window.removeEventListener("resize", this.#boundUpdatePos);

    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", this.#boundUpdatePos);
      window.visualViewport.removeEventListener("scroll", this.#boundUpdatePos);
    }

    // 3. 清理 UI 和 观察器
    // [修复问题2-A]：彻底销毁 DOM，防止僵尸状态
    this.removeFloatButton();

    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    this.#activeInput = null;

    this.#isEnabled = false;
    logger.info("Input Translator disabled.");
  }

  toggle() {
    this.#isEnabled ? this.disable() : this.enable();
  }

  // ============================
  // UI 交互事件处理
  // ============================

  handleFocusIn() {
    // [修复问题2-C]：如果刚刚触发了 blur 延时还没执行，立刻清除它，防止按钮闪现后消失
    if (this.#blurTimer) {
      clearTimeout(this.#blurTimer);
      this.#blurTimer = null;
    }

    const target = getDeepActiveElement();
    if (isEditableTarget(target)) {
      this.#activeInput = target;

      if (this.#resizeObserver) this.#resizeObserver.disconnect();
      this.#resizeObserver = new ResizeObserver(() => this.updateBtnPosition());
      this.#resizeObserver.observe(target);

      this.showFloatButton(target);
    }
  }

  handleFocusOut() {
    // 延时处理，因为点击按钮时会短暂触发 blur
    this.#blurTimer = setTimeout(() => {
      const newFocus = getDeepActiveElement();
      // 如果焦点转移到了我们的按钮上，或者还在原输入框（某些特殊情况），则不隐藏
      if (
        newFocus !== this.#activeInput &&
        !this.#floatBtn?.contains(newFocus)
      ) {
        this.hideFloatButton();
        this.#activeInput = null;
        if (this.#resizeObserver) {
          this.#resizeObserver.disconnect();
          this.#resizeObserver = null;
        }
      }
    }, 150);
  }

  // [修复问题1]：使用参数 inputNode 确保逻辑闭环
  showFloatButton(inputNode) {
    if (!this.#isEnabled) return;

    const showDot = this.#config.inputRule.showDot || OPT_INPUT_DOT_MOBILE;
    if (showDot === OPT_INPUT_DOT_DISABLE) return;
    if (showDot === OPT_INPUT_DOT_MOBILE) {
      const isTouch = isMobile || navigator.maxTouchPoints > 0;
      if (!isTouch) return;
    }

    // 确保 activeInput 与传入的节点一致
    this.#activeInput = inputNode;

    // 创建按钮 DOM (如果不存在)
    if (!this.#floatBtn) {
      this.createFloatButtonDOM();
    }

    this.#floatBtn.style.display = "flex";
    this.updateBtnPosition();
  }

  // 将创建逻辑抽离，保持代码整洁
  createFloatButtonDOM() {
    this.#floatBtn = document.createElement("div");
    // ... 样式代码保持不变 ...
    const isTouch = isMobile || navigator.maxTouchPoints > 0;
    const size = isTouch ? "36px" : "30px";

    this.#floatBtn.style.cssText = `
        position: fixed;
        width: ${size}; height: ${size};
        background: #209CEE;
        border-radius: 50%;
        z-index: 2147483647;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        transition: opacity 0.2s;
        font-size: 13px; color: white;
        user-select: none; -webkit-user-select: none;
      `;
    this.#floatBtn.innerText = "译";

    const preventFocusLoss = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    // 这里的监听器随 DOM 销毁而销毁，无需手动 removeEventListener
    this.#floatBtn.addEventListener("mousedown", preventFocusLoss);
    this.#floatBtn.addEventListener("touchstart", preventFocusLoss, {
      passive: false,
    });

    const handleTrigger = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.#activeInput) this.#activeInput.focus();
      this.handleTranslate({ isBtnTrigger: true });
    };

    this.#floatBtn.addEventListener("click", handleTrigger);
    this.#floatBtn.addEventListener("touchend", handleTrigger);

    document.body.appendChild(this.#floatBtn);
  }

  // 仅仅隐藏（失焦时用）
  hideFloatButton() {
    if (this.#floatBtn) {
      this.#floatBtn.style.display = "none";
    }
  }

  // 彻底移除（禁用时用）
  removeFloatButton() {
    if (this.#floatBtn) {
      this.#floatBtn.remove(); // 从 DOM 删除
      this.#floatBtn = null; // 清空引用
    }
  }

  updateBtnPosition() {
    // 增加对 activeInput 是否还在文档中的检查
    if (
      !this.#activeInput ||
      !this.#activeInput.isConnected || // 检查元素是否已被移除
      !this.#floatBtn ||
      this.#floatBtn.style.display === "none"
    ) {
      // 如果输入框都不在了，直接隐藏按钮
      if (this.#floatBtn) this.hideFloatButton();
      return;
    }

    const rect = this.#activeInput.getBoundingClientRect();
    // ... 位置计算逻辑保持不变 ...
    const isTouch = isMobile || navigator.maxTouchPoints > 0;
    const btnSize = isTouch ? 36 : 30;
    const padding = 5;
    let top = rect.bottom - btnSize - padding;
    let left = rect.right - btnSize - padding;

    if (rect.height < 60) top = rect.top - btnSize - 2;
    // 确保按钮不超出屏幕范围
    left = Math.max(0, Math.min(left, window.innerWidth - btnSize - 2));
    top = Math.max(0, Math.min(top, window.innerHeight - btnSize - 2));

    this.#floatBtn.style.top = `${top}px`;
    this.#floatBtn.style.left = `${left}px`;
  }

  // ============================
  // 核心业务：翻译处理
  // ============================

  /**
   * 执行翻译逻辑
   * @param {Object} options
   * @param {boolean} options.isBtnTrigger 是否由悬浮按钮触发
   */
  async handleTranslate({ isBtnTrigger = false } = {}) {
    logger.debug("handle input translate");

    // 1. 获取真正的焦点元素
    const node = getDeepActiveElement();

    // 2. 检查节点是否支持
    if (!node || !isEditableTarget(node)) {
      logger.debug("Active node is not editable");
      return;
    }

    const { apiSlug, transSign, triggerCount } = this.#config.inputRule;
    let { fromLang, toLang } = this.#config.inputRule;

    // 3. 获取文本
    let initText = getNodeText(node);

    // 4. 处理触发字符逻辑
    // 修改：仅当非按钮触发（即键盘快捷键触发）时，才移除末尾的触发符
    if (
      !isBtnTrigger &&
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
        const langMap = {
          zh: "zh-CN",
          cn: "zh-CN",
          tw: "zh-TW",
          hk: "zh-TW",
          jp: "ja",
          kr: "ko",
        };
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
      this.hideFloatButton(); // 翻译期间隐藏按钮

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
      }
    } catch (err) {
      logger.error("Translate input error:", err);
    } finally {
      removeLoading(loadingId);
      // 恢复显示按钮
      if (this.#activeInput === node) {
        this.showFloatButton(node);
      }
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
