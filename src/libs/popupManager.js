import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS, EVENT_KISS_INNER, MSG_POPUP_TOGGLE } from "../config";
import Action from "../views/Action";

/**
 * 网页内交互面板（Popup Panel / Action Menu）管理器
 * 负责在 Shadow DOM 隔离环境中挂载及管理 Action 控制面板的显示、隐藏和事件触发。
 */
export class PopupManager extends ShadowDomManager {
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
      reactComponent: Action,
      props: { translator, processActions },
    });
  }

  /**
   * 切换弹出面板显示隐藏状态
   * 如果当前已经可见，则向内层组件派发一个开关指令事件让其优雅淡出；否则直接执行 DOM 挂载显示
   * @param {object} [props] - 可选的属性更新
   */
  toggle(props) {
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
