import React from "react";
import ReactDOM from "react-dom/client";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import Slection from "../views/Selection";
import { DEFAULT_TRANBOX_SETTING, APP_CONSTS } from "../config";

export class TransboxManager {
  #container = null;
  #reactRoot = null;
  #shadowContainer = null;
  #props = {};

  constructor(initialProps = {}) {
    this.#props = initialProps;

    const { tranboxSetting = DEFAULT_TRANBOX_SETTING } = this.#props;
    if (tranboxSetting?.transOpen) {
      this.enable();
    }
  }

  isEnabled() {
    return !!this.#container && document.body.contains(this.#container);
  }

  enable() {
    if (!this.isEnabled()) {
      this.#container = document.createElement("div");
      this.#container.id = APP_CONSTS.boxID;
      this.#container.className = "notranslate";

      document.body.appendChild(this.#container);
      this.#shadowContainer = this.#container.attachShadow({ mode: "open" });
      const shadowRootElement = document.createElement("div");
      shadowRootElement.className = `${APP_CONSTS.boxID}_wrapper notranslate`;
      this.#shadowContainer.appendChild(shadowRootElement);

      const cache = createCache({
        key: APP_CONSTS.boxID,
        prepend: true,
        container: this.#shadowContainer,
      });

      this.#reactRoot = ReactDOM.createRoot(shadowRootElement);
      this.#reactRoot.render(
        <React.StrictMode>
          <CacheProvider value={cache}>
            <Slection {...this.#props} />
          </CacheProvider>
        </React.StrictMode>
      );
    }
  }

  disable() {
    if (!this.isEnabled() || !this.#reactRoot) {
      return;
    }
    this.#reactRoot.unmount();
    this.#container.remove();
    this.#container = null;
    this.#reactRoot = null;
    this.#shadowContainer = null;
  }

  toggle() {
    if (this.isEnabled()) {
      this.disable();
    } else {
      this.enable();
    }
  }

  update(newProps) {
    this.#props = { ...this.#props, ...newProps };
    if (this.isEnabled()) {
      if (!this.#props.tranboxSetting?.transOpen) {
        this.disable();
      } else {
        this.enable();
      }
    }
  }
}
