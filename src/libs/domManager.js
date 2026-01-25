import React from "react";
import ReactDOM from "react-dom/client";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { logger } from "./log";

/**
 * 普通 DOM 管理器，用于管理 React 组件的挂载、更新和销毁
 * 与 ShadowDomManager 不同，此管理器直接将组件挂载到普通 DOM 节点，不使用 Shadow DOM
 * 这样可以让组件直接访问外部数据，无需通过事件通信
 */
export default class DomManager {
  #hostElement = null;
  #reactRoot = null;
  #isVisible = false;
  #isProcessing = false;

  _id;
  _className;
  _ReactComponent;
  _props;
  _rootElement;

  constructor({
    id,
    className = "",
    reactComponent,
    props = {},
    rootElement = document.body,
  }) {
    if (!id || !reactComponent) {
      throw new Error("ID and a React Component must be provided.");
    }
    this._id = id;
    this._className = className;
    this._ReactComponent = reactComponent;
    this._props = props;
    this._rootElement = rootElement;
  }

  get isVisible() {
    return this.#isVisible;
  }

  /**
   * 显示组件
   * @param {Object} props - 可选的新 props，如果不提供则使用构造函数中的 props
   */
  show(props) {
    if (this.#isVisible || this.#isProcessing) {
      return;
    }

    if (!this.#hostElement) {
      this.#isProcessing = true;
      try {
        this.#mount(props || this._props);
      } catch (error) {
        logger.warn(`Failed to mount component with id "${this._id}":`, error);
        this.#isProcessing = false;
        return;
      } finally {
        this.#isProcessing = false;
      }
    }

    this.#hostElement.style.display = "";
    this.#isVisible = true;
  }

  /**
   * 隐藏组件（不销毁）
   */
  hide() {
    if (!this.#isVisible || !this.#hostElement) {
      return;
    }
    this.#hostElement.style.display = "none";
    this.#isVisible = false;
  }

  /**
   * 销毁组件并移除 DOM 节点
   */
  destroy() {
    if (!this.#hostElement) {
      return;
    }
    this.#isProcessing = true;

    if (this.#reactRoot) {
      this.#reactRoot.unmount();
    }

    this.#hostElement.remove();

    this.#hostElement = null;
    this.#reactRoot = null;
    this.#isVisible = false;
    this.#isProcessing = false;
    logger.info(`Component with id "${this._id}" has been destroyed.`);
  }

  /**
   * 切换组件显示/隐藏状态
   * @param {Object} props - 可选的新 props
   */
  toggle(props) {
    if (this.#isVisible) {
      this.hide();
    } else {
      this.show(props || this._props);
    }
  }

  /**
   * 更新组件 props（仅在组件已挂载时有效）
   * @param {Object} newProps - 新的 props
   */
  updateProps(newProps) {
    if (this.#reactRoot && this.#hostElement) {
      const ComponentToRender = this._ReactComponent;
      const cache = createCache({
        key: this._id,
        prepend: true,
      });
      this.#reactRoot.render(
        <React.StrictMode>
          <CacheProvider value={cache}>
            <ComponentToRender {...newProps} />
          </CacheProvider>
        </React.StrictMode>
      );
    }
  }

  /**
   * 挂载组件到 DOM
   * @private
   */
  #mount(props) {
    const host = document.createElement("div");
    host.id = this._id;
    if (this._className) {
      host.className = this._className;
    }

    this._rootElement.appendChild(host);
    this.#hostElement = host;

    const cache = createCache({
      key: this._id,
      prepend: true,
    });

    const enhancedProps = {
      ...props,
      onClose: this.hide.bind(this),
    };

    const ComponentToRender = this._ReactComponent;
    this.#reactRoot = ReactDOM.createRoot(host);
    this.#reactRoot.render(
      <React.StrictMode>
        <CacheProvider value={cache}>
          <ComponentToRender {...enhancedProps} />
        </CacheProvider>
      </React.StrictMode>
    );
  }
}
