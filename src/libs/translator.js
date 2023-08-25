import { createRoot } from "react-dom/client";
import {
  APP_LCNAME,
  TRANS_MIN_LENGTH,
  TRANS_MAX_LENGTH,
  EVENT_KISS,
  MSG_TRANS_CURRULE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_FUZZY,
  SHADOW_KEY,
} from "../config";
import Content from "../views/Content";
import { fetchUpdate, fetchClear } from "./fetch";
import { debounce } from "./utils";

/**
 * 翻译类
 */
export class Translator {
  _rule = {};
  _minLength = 0;
  _maxLength = 0;
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
  _rootNodes = new Set();
  _tranNodes = new Set();

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

  constructor(rule, { fetchInterval, fetchLimit, minLength, maxLength }) {
    fetchUpdate(fetchInterval, fetchLimit);
    this._overrideAttachShadow();
    this._minLength = minLength ?? TRANS_MIN_LENGTH;
    this._maxLength = maxLength ?? TRANS_MAX_LENGTH;
    this.rule = rule;
    if (rule.transOpen === "true") {
      this._register();
    }
  }

  get rule() {
    // console.log("get rule", this._rule);
    return this._rule;
  }

  set rule(rule) {
    // console.log("set rule", rule);
    this._rule = rule;

    // 广播消息
    window.dispatchEvent(
      new CustomEvent(EVENT_KISS, {
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
      return node.querySelectorAll(selector);
    } catch (err) {
      console.log(`[querySelectorAll err]: ${selector}`);
    }
    return [];
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
                this._rootNodes.add(outNode.shadowRoot);
                this._querySelectorAll(inSelector, outNode.shadowRoot).forEach(
                  (item) => {
                    this._tranNodes.add(item);
                  }
                );
              }
            });
          }
        } else {
          this._querySelectorAll(selector, rootNode).forEach((item) => {
            this._tranNodes.add(item);
          });
        }
      });
  };

  _register = () => {
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

    this._tranNodes.forEach((node) => {
      // 监听节点显示
      this._interseObserver.observe(node);
    });
  };

  _unRegister = () => {
    // 解除节点变化监听
    this._mutaObserver.disconnect();

    // 解除节点显示监听
    this._interseObserver.disconnect();

    // 移除已插入元素
    this._tranNodes.forEach((node) => {
      node.querySelector(APP_LCNAME)?.remove();
    });

    // 清空节点集合
    this._rootNodes.clear();
    this._tranNodes.clear();

    // 清空任务池
    fetchClear();
  };

  _reTranslate = debounce(() => {
    if (this._rule.transOpen === "true") {
      this._register();
    }
  }, 500);

  _render = (el) => {
    // 已翻译
    if (el.querySelector(APP_LCNAME)) {
      return;
    }

    // 太长或太短
    const q = el.innerText.trim();
    if (!q || q.length < this._minLength || q.length > this._maxLength) {
      return;
    }

    console.log("---> ", q);

    const span = document.createElement(APP_LCNAME);
    span.style.visibility = "visible";
    el.appendChild(span);
    el.style.cssText +=
      "-webkit-line-clamp: unset; max-height: none; height: auto;";
    if (el.parentElement) {
      el.parentElement.style.cssText +=
        "-webkit-line-clamp: unset; max-height: none; height: auto;";
    }

    const root = createRoot(span);
    root.render(<Content q={q} translator={this} />);
  };
}
