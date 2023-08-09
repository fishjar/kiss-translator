import { createRoot } from "react-dom/client";
import {
  APP_LCNAME,
  TRANS_MIN_LENGTH,
  TRANS_MAX_LENGTH,
  EVENT_KISS,
  MSG_TRANS_CURRULE,
} from "../config";
import { StoragesProvider } from "../hooks/Storage";
import { queryEls } from ".";
import Content from "../views/Content";

/**
 * 翻译类
 */
export class Translator {
  _rule = {};

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

  _mutaObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        try {
          queryEls(this.rule.selector, node).forEach((el) => {
            this._interseObserver.observe(el);
          });
        } catch (err) {
          //
        }
      });
    });
  });

  constructor(rule) {
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

  _register = () => {
    // 监听节点变化
    this._mutaObserver.observe(document, {
      childList: true,
      subtree: true,
    });

    // 监听节点显示
    queryEls(this.rule.selector).forEach((el) => {
      this._interseObserver.observe(el);
    });
  };

  _unRegister = () => {
    // 解除节点变化监听
    this._mutaObserver.disconnect();

    // 解除节点显示监听
    queryEls(this.rule.selector).forEach((el) =>
      this._interseObserver.unobserve(el)
    );

    // 移除已插入元素
    queryEls(APP_LCNAME).forEach((el) => el.remove());
  };

  _render = (el) => {
    // 含子元素
    if (el.querySelector(this.rule.selector)) {
      return;
    }

    // 已翻译
    if (el.querySelector(APP_LCNAME)) {
      return;
    }

    // 太长或太短
    const q = el.innerText.trim();
    if (!q || q.length < TRANS_MIN_LENGTH || q.length > TRANS_MAX_LENGTH) {
      return;
    }

    // console.log("---> ", q);

    const span = document.createElement(APP_LCNAME);
    el.appendChild(span);

    const root = createRoot(span);
    root.render(
      <StoragesProvider>
        <Content q={q} translator={this} />
      </StoragesProvider>
    );
  };
}
