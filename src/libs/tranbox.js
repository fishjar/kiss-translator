import React from "react";
import ReactDOM from "react-dom/client";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import Slection from "../views/Selection";
import {
  DEFAULT_TRANBOX_SETTING,
  APP_CONSTS,
  resolveApiPromptList,
} from "../config";
import { isolateShadowHost, mountShadowHost } from "./shadowHost";

function resolvePromptProps(props = {}) {
  return {
    ...props,
    transApis: resolveApiPromptList(
      props.transApis,
      props.prompts,
      props.subtitleSetting
    ),
  };
}

export class TransboxManager {
  #container = null;
  #reactRoot = null;
  #shadowContainer = null;
  #cache = null;
  #props = {};
  #cleanupHostMount = null;

  constructor(initialProps = {}) {
    this.#props = resolvePromptProps(initialProps);

    const { tranboxSetting = DEFAULT_TRANBOX_SETTING } = this.#props;
    if (tranboxSetting?.transOpen) {
      this.enable();
    }
  }

  isEnabled() {
    return Boolean(this.#container?.isConnected);
  }

  enable() {
    if (!this.isEnabled()) {
      this.disable();
      this.#container = document.createElement("div");
      this.#container.id = APP_CONSTS.boxID;
      this.#container.className = "notranslate";
      isolateShadowHost(this.#container);

      this.#cleanupHostMount = mountShadowHost(this.#container, undefined, {
        onReconnect: () => this.#refreshStyles(),
      });
      this.#shadowContainer = this.#container.attachShadow({ mode: "open" });
      const shadowRootElement = document.createElement("div");
      shadowRootElement.className = `${APP_CONSTS.boxID}_wrapper notranslate`;
      this.#shadowContainer.appendChild(shadowRootElement);

      this.#reactRoot = ReactDOM.createRoot(shadowRootElement);
      this.#refreshStyles();
    }
  }

  #refreshStyles() {
    this.#cache?.sheet.flush();
    this.#cache = createCache({
      key: APP_CONSTS.boxID,
      prepend: true,
      container: this.#shadowContainer,
    });
    // A new cache restores CSSOM lost during page-owned DOM removal while the
    // unchanged React root preserves unsaved selection text and panel state.
    this.#render();
  }

  #render() {
    if (!this.#reactRoot || !this.#cache) {
      return;
    }

    this.#reactRoot.render(
      <React.StrictMode>
        <CacheProvider value={this.#cache}>
          <Slection {...this.#props} />
        </CacheProvider>
      </React.StrictMode>
    );
  }

  disable() {
    this.#cleanupHostMount?.();
    this.#cleanupHostMount = null;
    this.#reactRoot?.unmount();
    this.#cache?.sheet.flush();
    this.#container?.remove();
    this.#container = null;
    this.#reactRoot = null;
    this.#shadowContainer = null;
    this.#cache = null;
  }

  toggle() {
    if (this.isEnabled()) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * 更新属性并根据开关状态决定重新启用或禁用
   * // REVIEW: React 组件热更新失效隐患。
   * // 如果翻译框当前已启用且仍然保持开启，在调用 `update(newProps)` 时，合并新 props 后会走 `else { this.enable() }` 分支。
   * // 然而，在 `enable()` 方法内部首行有判断保护：`if (!this.isEnabled()) { ... }`。
   * // 导致当翻译框已经在页面中活跃（isEnabled() 为 true）时，`enable()` 会直接跳出执行，并不重新调用 render。
   * // 这样导致新传入并合并的 `newProps` 根本无法渲染到底层的 `Slection` 组件上，翻译框配置无法动态同步。
   * @param {Object} newProps - 新的属性配置
   */
  update(newProps) {
    this.#props = resolvePromptProps({ ...this.#props, ...newProps });
    if (!this.#props.tranboxSetting?.transOpen) {
      this.disable();
      return;
    }

    if (this.isEnabled()) {
      this.#render();
    } else {
      this.enable();
    }
  }
}
