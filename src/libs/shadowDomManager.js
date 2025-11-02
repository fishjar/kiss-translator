import React from "react";
import ReactDOM from "react-dom/client";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { logger } from "./log";

export default class ShadowDomManager {
  #hostElement = null;
  #reactRoot = null;
  #isVisible = false;
  #isProcessing = false;

  _id;
  _className;
  _ReactComponent;
  _props;

  constructor({ id, className = "", reactComponent, props = {} }) {
    if (!id || !reactComponent) {
      throw new Error("ID and a React Component must be provided.");
    }
    this._id = id;
    this._className = className;
    this._ReactComponent = reactComponent;
    this._props = props;
  }

  get isVisible() {
    return this.#isVisible;
  }

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

  hide() {
    if (!this.#isVisible || !this.#hostElement) {
      return;
    }
    this.#hostElement.style.display = "none";
    this.#isVisible = false;
  }

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

  toggle(props) {
    if (this.#isVisible) {
      this.hide();
    } else {
      this.show(props || this._props);
    }
  }

  #mount(props) {
    const host = document.createElement("div");
    host.id = this._id;
    if (this._className) {
      host.className = this._className;
    }

    document.body.appendChild(host);
    this.#hostElement = host;
    const shadowContainer = host.attachShadow({ mode: "open" });
    const appRoot = document.createElement("div");
    appRoot.className = `${this._id}_wrapper`;
    shadowContainer.appendChild(appRoot);

    const cache = createCache({
      key: this._id,
      prepend: true,
      container: shadowContainer,
    });

    const enhancedProps = {
      ...props,
      onClose: this.hide.bind(this),
    };

    const ComponentToRender = this._ReactComponent;
    this.#reactRoot = ReactDOM.createRoot(appRoot);
    this.#reactRoot.render(
      <React.StrictMode>
        <CacheProvider value={cache}>
          <ComponentToRender {...enhancedProps} />
        </CacheProvider>
      </React.StrictMode>
    );
  }
}
