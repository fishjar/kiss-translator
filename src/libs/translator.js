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
} from "../config";
import Content from "../views/Content";
import { updateFetchPool, clearFetchPool } from "./fetch";
import { debounce, genEventName } from "./utils";
import { runFixer } from "./webfix";

/**
 * 翻译类
 */
export class Translator {
  _rule = {};
  _setting = {};
  _fixerSetting = null;
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
  _mouseoverNode = null;

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

  constructor(rule, setting, fixerSetting) {
    const { fetchInterval, fetchLimit } = setting;
    updateFetchPool(fetchInterval, fetchLimit);
    this._overrideAttachShadow();

    this._setting = setting;
    this._rule = rule;
    this._fixerSetting = fixerSetting;

    if (rule.transOpen === "true") {
      this._register();
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

    // webfix
    if (this._fixerSetting) {
      runFixer(this._fixerSetting);
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

    if (
      !this._setting.mouseKey ||
      this._setting.mouseKey === OPT_MOUSEKEY_DISABLE
    ) {
      // 监听节点显示
      this._tranNodes.forEach((_, node) => {
        this._interseObserver.observe(node);
      });
    } else {
      // 监听鼠标悬停
      window.addEventListener("keydown", this._handleKeydown);
      this._tranNodes.forEach((_, node) => {
        node.addEventListener("mouseenter", this._handleMouseover);
        node.addEventListener("mouseleave", this._handleMouseout);
      });
    }
  };

  _handleMouseover = (e) => {
    // console.log("mouseenter", e);
    if (!this._tranNodes.has(e.target)) {
      return;
    }

    const key = this._setting.mouseKey.slice(3);
    if (this._setting.mouseKey === OPT_MOUSEKEY_MOUSEOVER || e[key]) {
      e.target.removeEventListener("mouseenter", this._handleMouseover);
      e.target.removeEventListener("mouseleave", this._handleMouseout);
      this._render(e.target);
    } else {
      this._mouseoverNode = e.target;
    }
  };

  _handleMouseout = (e) => {
    // console.log("mouseleave", e);
    if (!this._tranNodes.has(e.target)) {
      return;
    }

    this._mouseoverNode = null;
  };

  _handleKeydown = (e) => {
    // console.log("keydown", e);
    const key = this._setting.mouseKey.slice(3);
    if (e[key] && this._mouseoverNode) {
      this._mouseoverNode.removeEventListener(
        "mouseenter",
        this._handleMouseover
      );
      this._mouseoverNode.removeEventListener(
        "mouseleave",
        this._handleMouseout
      );

      const node = this._mouseoverNode;
      this._render(node);
      this._mouseoverNode = null;
    }
  };

  _unRegister = () => {
    // 解除节点变化监听
    this._mutaObserver.disconnect();

    // 解除节点显示监听
    // this._interseObserver.disconnect();

    if (
      !this._setting.mouseKey ||
      this._setting.mouseKey === OPT_MOUSEKEY_DISABLE
    ) {
      // 解除节点显示监听
      this._tranNodes.forEach((_, node) => {
        this._interseObserver.unobserve(node);
        // 移除已插入元素
        node.querySelector(APP_LCNAME)?.remove();
      });
    } else {
      // 移除鼠标悬停监听
      window.removeEventListener("keydown", this._handleKeydown);
      this._tranNodes.forEach((_, node) => {
        // node.style.pointerEvents = "none";
        node.removeEventListener("mouseenter", this._handleMouseover);
        node.removeEventListener("mouseleave", this._handleMouseout);
        // 移除已插入元素
        node.querySelector(APP_LCNAME)?.remove();
      });
    }

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

  _invalidLength = (q) =>
    !q ||
    q.length < (this._setting.minLength ?? TRANS_MIN_LENGTH) ||
    q.length > (this._setting.maxLength ?? TRANS_MAX_LENGTH);

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

    let q = el.innerText.trim();
    this._tranNodes.set(el, q);

    // 太长或太短
    if (this._invalidLength(q)) {
      return;
    }

    // console.log("---> ", q);

    const keepSelector = this._rule.keepSelector || "";
    const keeps = [];
    const [matchSelector, subSelector] = keepSelector.split(SHADOW_KEY);
    if (matchSelector.trim() || subSelector?.trim()) {
      let text = "";
      el.childNodes.forEach((child) => {
        if (
          child.nodeType === 1 &&
          ((matchSelector.trim() && child.matches(matchSelector)) ||
            (subSelector?.trim() && child.querySelector(subSelector)))
        ) {
          if (child.nodeName === "IMG") {
            child.style.cssText += `width: ${child.width}px;`;
            child.style.cssText += `height: ${child.height}px;`;
          }
          text += `#${keeps.length}#`;
          keeps.push(child.outerHTML);
        } else {
          text += child.textContent;
        }
      });

      // 太长或太短
      if (this._invalidLength(text.replace(/#(\d+)#/g, "").trim())) {
        return;
      }

      if (keeps.length > 0) {
        q = text;
      }
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
    root.render(<Content q={q} keeps={keeps} translator={this} />);
  };
}
