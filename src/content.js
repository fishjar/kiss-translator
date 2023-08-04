import { browser } from "./libs/browser";
import { createRoot } from "react-dom/client";
import {
  APP_LCNAME,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  TRANS_MIN_LENGTH,
  TRANS_MAX_LENGTH,
} from "./config";
import Content from "./views/Content";
import { StoragesProvider } from "./hooks/Storage";
import { queryEls, getRules, matchRule } from "./libs";
import { getSetting } from "./libs";
import { transPool } from "./libs/pool";

/**
 * 翻译类
 */
class Translator {
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
          queryEls(this._rule.selector, node).forEach((el) => {
            this._interseObserver.observe(el);
          });
        } catch (err) {
          //
        }
      });
    });
  });

  constructor(rule) {
    this._rule = rule;
    if (rule.transOpen) {
      this._register();
    }
  }

  get rule() {
    return this._rule;
  }

  updateRule = (obj) => {
    this._rule = { ...this._rule, ...obj };
  };

  toggle = () => {
    if (this._rule.transOpen) {
      this._rule.transOpen = false;
      this._unRegister();
    } else {
      this._rule.transOpen = true;
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
    queryEls(this._rule.selector).forEach((el) => {
      this._interseObserver.observe(el);
    });
  };

  _unRegister = () => {
    // 解除节点变化监听
    this._mutaObserver.disconnect();

    // 解除节点显示监听
    queryEls(this._rule.selector).forEach((el) =>
      this._interseObserver.unobserve(el)
    );

    // 移除已插入元素
    queryEls(APP_LCNAME).forEach((el) => el.remove());
  };

  _render = (el) => {
    if (el.querySelector(APP_LCNAME)) {
      return;
    }

    // 除openai外，保留code和a标签
    const q = el.innerText.trim();
    if (!q || q.length < TRANS_MIN_LENGTH || q.length > TRANS_MAX_LENGTH) {
      // 太长或太短不翻译
      return;
    }

    // console.log("---> ", q);

    const span = document.createElement(APP_LCNAME);
    el.appendChild(span);

    const root = createRoot(span);
    root.render(
      <StoragesProvider>
        <Content q={q} rule={this._rule} />
      </StoragesProvider>
    );
  };
}

/**
 * 入口函数
 */
(async () => {
  const { fetchInterval, fetchLimit } = await getSetting();
  transPool.update(fetchInterval, fetchLimit);

  const rules = await getRules();
  const rule = matchRule(rules, document.location.href);
  const translator = new Translator(rule);

  // 监听消息
  browser?.runtime.onMessage.addListener(async ({ action, args }) => {
    switch (action) {
      case MSG_TRANS_TOGGLE:
        translator.toggle();
        break;
      case MSG_TRANS_GETRULE:
        break;
      case MSG_TRANS_PUTRULE:
        translator.updateRule(args);
        break;
      default:
        return { error: `message action is unavailable: ${action}` };
    }
    return { data: translator.rule };
  });
})();
