import { kissLog } from "./log";

/**
 * @class ShadowRootMonitor
 * @description 通过覆写 Element.prototype.attachShadow 来监控页面上所有新创建的 Shadow DOM
 */
export class ShadowRootMonitor {
  /**
   * @param {function(ShadowRoot): void} callback - 当一个新的 shadowRoot 被创建时调用的回调函数。
   */
  constructor(callback) {
    if (typeof callback !== "function") {
      throw new Error("Callback must be a function.");
    }

    this.callback = callback;
    this.isMonitoring = false;
    this.originalAttachShadow = Element.prototype.attachShadow;
  }

  /**
   * 开始监控 shadowRoot 的创建。
   */
  start() {
    if (this.isMonitoring) {
      return;
    }
    const monitorInstance = this;

    Element.prototype.attachShadow = function (...args) {
      const shadowRoot = monitorInstance.originalAttachShadow.apply(this, args);
      if (shadowRoot) {
        try {
          monitorInstance.callback(shadowRoot);
        } catch (error) {
          kissLog("Error in ShadowRootMonitor callback", error);
        }
      }
      return shadowRoot;
    };

    this.isMonitoring = true;
  }

  /**
   * 停止监控，并恢复原始的 attachShadow 方法。
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    Element.prototype.attachShadow = this.originalAttachShadow;
    this.isMonitoring = false;
  }
}
