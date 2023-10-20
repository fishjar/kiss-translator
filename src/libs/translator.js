import { createRoot } from "react-dom/client";
import {
  APP_LCNAME,
  TRANS_MIN_LENGTH,
  TRANS_MAX_LENGTH,
  MSG_TRANS_CURRULE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_FUZZY,
  SHADOW_KEY,
  OPT_MOUSEKEY_DISABLE,
  OPT_MOUSEKEY_MOUSEOVER,
  DEFAULT_INPUT_RULE,
  DEFAULT_TRANS_APIS,
  DEFAULT_INPUT_SHORTCUT,
  OPT_LANGS_LIST,
} from "../config";
import Content from "../views/Content";
import { updateFetchPool, clearFetchPool } from "./fetch";
import {
  debounce,
  genEventName,
  removeEndchar,
  matchInputStr,
  sleep,
} from "./utils";
import { stepShortcutRegister } from "./shortcut";
import { apiTranslate } from "../apis";
import { tryDetectLang } from ".";
import { loadingSvg } from "./svg";

function isInputNode(node) {
  return node.nodeName === "INPUT" || node.nodeName === "TEXTAREA";
}

function isEditAbleNode(node) {
  return node.hasAttribute("contenteditable");
}

function selectContent(node) {
  node.focus();
  const range = document.createRange();
  range.selectNodeContents(node);

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function pasteContentEvent(node, text) {
  node.focus();
  const data = new DataTransfer();
  data.setData("text/plain", text);

  const event = new ClipboardEvent("paste", { clipboardData: data });
  document.dispatchEvent(event);
  data.clearData();
}

function pasteContentCommand(node, text) {
  node.focus();
  document.execCommand("insertText", false, text);
}

function collapseToEnd(node) {
  node.focus();
  const selection = window.getSelection();
  selection.collapseToEnd();
}

function getNodeText(node) {
  if (isInputNode(node)) {
    return node.value;
  }
  return node.innerText || node.textContent || "";
}

function addLoading(node, loadingId) {
  const div = document.createElement("div");
  div.id = loadingId;
  div.innerHTML = loadingSvg;
  div.style.cssText = `
      width: ${node.offsetWidth}px;
      height: ${node.offsetHeight}px;
      line-height: ${node.offsetHeight}px;
      position: absolute;
      text-align: center;
      left: ${node.offsetLeft}px;
      top: ${node.offsetTop}px;
      z-index: 2147483647;
    `;
  node.offsetParent?.appendChild(div);
}

function removeLoading(node, loadingId) {
  const div = node.offsetParent.querySelector(`#${loadingId}`);
  if (div) {
    div.remove();
  }
}

/**
 * 翻译类
 */
export class Translator {
  _rule = {};
  _inputRule = {};
  _setting = {};
  _rootNodes = new Set();
  _tranNodes = new Map();
  _skipNodeNames = [
    APP_LCNAME,
    "style",
    "svg",
    "img",
    "audio",
    "video",
    "textarea",
    "input",
    "button",
    "select",
    "option",
    "head",
    "script",
    "iframe",
  ];
  _eventName = genEventName();

  // 显示
  _interseObserver = new IntersectionObserver(
    (intersections) => {
      intersections.forEach((intersection) => {
        if (intersection.isIntersecting) {
          this._render(intersection.target);
          this._interseObserver.unobserve(intersection.target);
        }
      });
    },
    {
      threshold: 0.1,
    }
  );

  // 变化
  _mutaObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        !this._skipNodeNames.includes(mutation.target.localName) &&
        mutation.addedNodes.length > 0
      ) {
        const nodes = Array.from(mutation.addedNodes).filter((node) => {
          if (
            this._skipNodeNames.includes(node.localName) ||
            node.id === APP_LCNAME
          ) {
            return false;
          }
          return true;
        });
        if (nodes.length > 0) {
          // const rootNode = mutation.target.getRootNode();
          // todo
          this._reTranslate();
        }
      }
    });
  });

  // 插入 shadowroot
  _overrideAttachShadow = () => {
    const _this = this;
    const _attachShadow = HTMLElement.prototype.attachShadow;
    HTMLElement.prototype.attachShadow = function () {
      _this._reTranslate();
      return _attachShadow.apply(this, arguments);
    };
  };

  constructor(rule, setting) {
    const { fetchInterval, fetchLimit } = setting;
    updateFetchPool(fetchInterval, fetchLimit);
    this._overrideAttachShadow();

    this._setting = setting;
    this._rule = rule;

    if (rule.transOpen === "true") {
      this._register();
    }

    this._inputRule = setting.inputRule || DEFAULT_INPUT_RULE;
    if (this._inputRule.transOpen) {
      this._registerInput();
    }
  }

  get setting() {
    return this._setting;
  }

  get eventName() {
    return this._eventName;
  }

  get rule() {
    // console.log("get rule", this._rule);
    return this._rule;
  }

  set rule(rule) {
    // console.log("set rule", rule);
    this._rule = rule;

    // 广播消息
    const eventName = this._eventName;
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          action: MSG_TRANS_CURRULE,
          args: rule,
        },
      })
    );
  }

  updateRule = (obj) => {
    this.rule = { ...this.rule, ...obj };
  };

  toggle = () => {
    if (this.rule.transOpen === "true") {
      this.rule = { ...this.rule, transOpen: "false" };
      this._unRegister();
    } else {
      this.rule = { ...this.rule, transOpen: "true" };
      this._register();
    }
  };

  toggleStyle = () => {
    const textStyle =
      this.rule.textStyle === OPT_STYLE_FUZZY
        ? OPT_STYLE_DASHLINE
        : OPT_STYLE_FUZZY;
    this.rule = { ...this.rule, textStyle };
  };

  _querySelectorAll = (selector, node) => {
    try {
      return Array.from(node.querySelectorAll(selector));
    } catch (err) {
      console.log(`[querySelectorAll err]: ${selector}`);
    }
    return [];
  };

  _queryFilter = (selector, rootNode) => {
    return this._querySelectorAll(selector, rootNode).filter(
      (node) => this._queryFilter(selector, node).length === 0
    );
  };

  _queryShadowNodes = (selector, rootNode) => {
    this._rootNodes.add(rootNode);
    this._queryFilter(selector, rootNode).forEach((item) => {
      if (!this._tranNodes.has(item)) {
        this._tranNodes.set(item, "");
      }
    });

    Array.from(rootNode.querySelectorAll("*"))
      .map((item) => item.shadowRoot)
      .filter(Boolean)
      .forEach((item) => {
        this._queryShadowNodes(selector, item);
      });
  };

  _queryNodes = (rootNode = document) => {
    // const childRoots = Array.from(rootNode.querySelectorAll("*"))
    //   .map((item) => item.shadowRoot)
    //   .filter(Boolean);
    // const childNodes = childRoots.map((item) => this._queryNodes(item));
    // const nodes = Array.from(rootNode.querySelectorAll(this.rule.selector));
    // return nodes.concat(childNodes).flat();

    this._rootNodes.add(rootNode);
    this._rule.selector
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((selector) => {
        if (selector.includes(SHADOW_KEY)) {
          const [outSelector, inSelector] = selector
            .split(SHADOW_KEY)
            .map((item) => item.trim());
          if (outSelector && inSelector) {
            const outNodes = this._querySelectorAll(outSelector, rootNode);
            outNodes.forEach((outNode) => {
              if (outNode.shadowRoot) {
                // this._rootNodes.add(outNode.shadowRoot);
                // this._queryFilter(inSelector, outNode.shadowRoot).forEach(
                //   (item) => {
                //     if (!this._tranNodes.has(item)) {
                //       this._tranNodes.set(item, "");
                //     }
                //   }
                // );
                this._queryShadowNodes(inSelector, outNode.shadowRoot);
              }
            });
          }
        } else {
          this._queryFilter(selector, rootNode).forEach((item) => {
            if (!this._tranNodes.has(item)) {
              this._tranNodes.set(item, "");
            }
          });
        }
      });
  };

  _register = () => {
    if (this._rule.fromLang === this._rule.toLang) {
      return;
    }

    // 搜索节点
    this._queryNodes();

    this._rootNodes.forEach((node) => {
      // 监听节点变化;
      this._mutaObserver.observe(node, {
        childList: true,
        subtree: true,
        // characterData: true,
      });
    });

    this._tranNodes.forEach((_, node) => {
      if (
        !this._setting.mouseKey ||
        this._setting.mouseKey === OPT_MOUSEKEY_DISABLE
      ) {
        // 监听节点显示
        this._interseObserver.observe(node);
      } else {
        // 监听鼠标悬停
        node.addEventListener("mouseover", this._handleMouseover);
      }
    });
  };

  _registerInput = () => {
    const {
      triggerShortcut: initTriggerShortcut,
      translator,
      fromLang,
      toLang: initToLang,
      triggerCount: initTriggerCount,
      triggerTime,
      transSign,
    } = this._inputRule;
    const apiSetting =
      this._setting.transApis?.[translator] || DEFAULT_TRANS_APIS[translator];
    const { detectRemote } = this._setting;

    let triggerShortcut = initTriggerShortcut;
    let triggerCount = initTriggerCount;
    if (triggerShortcut.length === 0) {
      triggerShortcut = DEFAULT_INPUT_SHORTCUT;
      triggerCount = 1;
    }

    stepShortcutRegister(
      triggerShortcut,
      async () => {
        let node = document.activeElement;

        if (!node) {
          return;
        }

        while (node.shadowRoot) {
          node = node.shadowRoot.activeElement;
        }

        if (!isInputNode(node) && !isEditAbleNode(node)) {
          return;
        }

        let initText = getNodeText(node);
        if (triggerShortcut.length === 1 && triggerShortcut[0].length === 1) {
          // todo: remove multiple char
          initText = removeEndchar(initText, triggerShortcut[0], triggerCount);
        }
        if (!initText.trim()) {
          return;
        }

        let text = initText;
        let toLang = initToLang;
        if (transSign) {
          const res = matchInputStr(text, transSign);
          if (res) {
            let lang = res[1];
            if (lang === "zh" || lang === "cn") {
              lang = "zh-CN";
            } else if (lang === "tw" || lang === "hk") {
              lang = "zh-TW";
            }
            if (lang && OPT_LANGS_LIST.includes(lang)) {
              toLang = lang;
            }
            text = res[2];
          }
        }

        // console.log("input -->", text);

        const loadingId = "kiss-" + genEventName();
        try {
          addLoading(node, loadingId);

          const deLang = await tryDetectLang(text, detectRemote);
          if (deLang && toLang.includes(deLang)) {
            return;
          }

          const [trText, isSame] = await apiTranslate({
            translator,
            text,
            fromLang,
            toLang,
            apiSetting,
          });
          if (!trText || isSame) {
            return;
          }

          if (isInputNode(node)) {
            node.value = trText;
            node.dispatchEvent(
              new Event("input", { bubbles: true, cancelable: true })
            );
            return;
          }

          selectContent(node);
          await sleep(200);

          pasteContentEvent(node, trText);
          await sleep(200);

          // todo: use includes?
          if (getNodeText(node).startsWith(initText)) {
            pasteContentCommand(node, trText);
            await sleep(100);
          } else {
            collapseToEnd(node);
          }
        } catch (err) {
          console.log("[translate input]", err.message);
        } finally {
          removeLoading(node, loadingId);
        }
      },
      triggerCount,
      triggerTime
    );
  };

  _handleMouseover = (e) => {
    const key = this._setting.mouseKey.slice(3);
    if (this._setting.mouseKey === OPT_MOUSEKEY_MOUSEOVER || e[key]) {
      e.target.removeEventListener("mouseover", this._handleMouseover);
      this._render(e.target);
    }
  };

  _unRegister = () => {
    // 解除节点变化监听
    this._mutaObserver.disconnect();

    // 解除节点显示监听
    // this._interseObserver.disconnect();

    this._tranNodes.forEach((_, node) => {
      if (
        !this._setting.mouseKey ||
        this._setting.mouseKey === OPT_MOUSEKEY_DISABLE
      ) {
        // 解除节点显示监听
        this._interseObserver.unobserve(node);
      } else {
        // 移除鼠标悬停监听
        node.removeEventListener("mouseover", this._handleMouseover);
      }

      // 移除已插入元素
      node.querySelector(APP_LCNAME)?.remove();
    });

    // 清空节点集合
    this._rootNodes.clear();
    this._tranNodes.clear();

    // 清空任务池
    clearFetchPool();
  };

  _reTranslate = debounce(() => {
    if (this._rule.transOpen === "true") {
      this._register();
    }
  }, 500);

  _render = (el) => {
    let traEl = el.querySelector(APP_LCNAME);

    // 已翻译
    if (traEl) {
      const preText = this._tranNodes.get(el);
      const curText = el.innerText.trim();
      // const traText = traEl.innerText.trim();

      // todo
      // 1. traText when loading
      // 2. replace startsWith
      if (curText.startsWith(preText)) {
        return;
      }

      traEl.remove();
    }

    const q = el.innerText.trim();
    this._tranNodes.set(el, q);

    // 太长或太短
    if (
      !q ||
      q.length < (this._setting.minLength ?? TRANS_MIN_LENGTH) ||
      q.length > (this._setting.maxLength ?? TRANS_MAX_LENGTH)
    ) {
      return;
    }

    // console.log("---> ", q);

    traEl = document.createElement(APP_LCNAME);
    traEl.style.visibility = "visible";
    el.appendChild(traEl);
    el.style.cssText +=
      "-webkit-line-clamp: unset; max-height: none; height: auto;";
    if (el.parentElement) {
      el.parentElement.style.cssText +=
        "-webkit-line-clamp: unset; max-height: none; height: auto;";
    }

    const root = createRoot(traEl);
    root.render(<Content q={q} translator={this} />);
  };
}
