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
    return (
      !!this.#container && document.body.parentElement.contains(this.#container)
    );
  }

  enable() {
    if (!this.isEnabled()) {
      this.#container = document.createElement("div");
      this.#container.id = APP_CONSTS.boxID;
      this.#container.className = "notranslate";
      this.#container.style.cssText =
        "font-size: 0; width: 0; height: 0; border: 0; padding: 0; margin: 0;";
      document.body.parentElement.appendChild(this.#container);

      this.#shadowContainer = this.#container.attachShadow({ mode: "closed" });
      const emotionRoot = document.createElement("style");
      const shadowRootElement = document.createElement("div");
      shadowRootElement.className = `${APP_CONSTS.boxID}_warpper notranslate`;
      this.#shadowContainer.appendChild(emotionRoot);
      this.#shadowContainer.appendChild(shadowRootElement);
      const cache = createCache({
        key: APP_CONSTS.boxID,
        prepend: true,
        container: emotionRoot,
      });

      this.#reactRoot = ReactDOM.createRoot(shadowRootElement);
      this.CacheProvider = ({ children }) => (
        <CacheProvider value={cache}>{children}</CacheProvider>
      );
    }

    const AppProvider = this.CacheProvider;
    this.#reactRoot.render(
      <React.StrictMode>
        <AppProvider>
          <Slection {...this.#props} />
        </AppProvider>
      </React.StrictMode>
    );
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
    this.CacheProvider = null;
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
