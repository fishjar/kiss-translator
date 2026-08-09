import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS, EVENT_KISS_INNER, MSG_POPUP_TOGGLE } from "../config";
import Action from "../views/Action";

const POPUP_MANAGER_KEY = Symbol.for("kiss-translator.popup-manager");
const POPUP_MANAGER_BRAND = Symbol.for("kiss-translator.popup-manager.brand");

const getAvailablePopupID = () => {
  const baseID = APP_CONSTS.popupID;
  let candidateID = baseID;
  let suffix = 1;

  while (document.getElementById(candidateID)) {
    candidateID = `${baseID}-${suffix}`;
    suffix += 1;
  }

  return candidateID;
};

/**
 * 网页内交互面板（Popup Panel / Action Menu）管理器
 * 负责在 Shadow DOM 隔离环境中挂载及管理 Action 控制面板的显示、隐藏和事件触发。
 */
export class PopupManager extends ShadowDomManager {
  #isMounted = false;
  #isDestroyed = false;

  /**
   * 构造函数
   * @param {object} params
   * @param {Translator} params.translator - 翻译控制核心对象
   * @param {Function} params.processActions - 动作执行处理器
   */
  constructor({ translator, processActions }) {
    super({
      id: APP_CONSTS.popupID,
      className: "notranslate",
      cacheKey: APP_CONSTS.popupID,
      reactComponent: Action,
      props: { translator, processActions },
    });

    Object.defineProperty(this, POPUP_MANAGER_BRAND, { value: true });

    const previousManager = globalThis[POPUP_MANAGER_KEY];
    if (
      previousManager?.[POPUP_MANAGER_BRAND] === true &&
      previousManager !== this &&
      typeof previousManager.destroy === "function"
    ) {
      previousManager.destroy();
    }

    globalThis[POPUP_MANAGER_KEY] = this;
  }

  destroy() {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    super.destroy();
    this.#isMounted = false;
    if (globalThis[POPUP_MANAGER_KEY] === this) {
      delete globalThis[POPUP_MANAGER_KEY];
    }
  }

  show(props) {
    if (this.#isDestroyed) return;

    if (!this.#isMounted) {
      this._id = getAvailablePopupID();
    }

    super.show(props);
    this.#isMounted = this.isVisible;
  }

  /**
   * 切换弹出面板显示隐藏状态
   * 如果当前已经可见，则向内层组件派发一个开关指令事件让其优雅淡出；否则直接执行 DOM 挂载显示
   * @param {object} [props] - 可选的属性更新
   */
  toggle(props) {
    if (this.#isDestroyed) return;

    if (this.isVisible) {
      document.dispatchEvent(
        new CustomEvent(EVENT_KISS_INNER, {
          detail: { action: MSG_POPUP_TOGGLE },
        })
      );
    } else {
      this.show(props || this._props);
    }
  }
}
