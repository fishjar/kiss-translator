import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS } from "../config";
import ContentFab from "../views/Action/ContentFab";
import { shortcutRegister } from "./shortcut";

/**
 * 网页内悬浮球（Float Action Button）管理器
 * 负责实例化并挂载 ContentFab 组件，它被包裹在隔离的 Shadow DOM 容器中以防止外部网页 CSS 样式对其产生干扰。
 */
export class FabManager extends ShadowDomManager {
  #clearShortcut;

  /**
   * 构造函数
   * @param {object} params
   * @param {Function} params.processActions - 动作执行处理器
   * @param {object} params.fabConfig - 悬浮球的配置参数
   */
  constructor({
    processActions,
    fabConfig,
    getSelectionEnabled,
    onVisibilityChange,
  }) {
    super({
      id: APP_CONSTS.fabID,
      className: "notranslate",
      reactComponent: ContentFab,
      props: {
        processActions,
        fabConfig,
        getSelectionEnabled,
        onVisibilityChange,
      },
    });

    // 如果配置没有指明隐藏，则在初始化时自动显示悬浮球
    if (!fabConfig?.isHide) {
      this.show();
    }

    // Register even when hidden, for both extensions and userscripts.
    this.#clearShortcut = shortcutRegister(["AltLeft", "KeyB"], () =>
      this.show()
    );
  }

  destroy() {
    this.#clearShortcut();
    super.destroy();
  }
}
