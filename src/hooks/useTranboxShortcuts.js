import { useEffect, useCallback } from "react";
import { isGm } from "../libs/client";
import { kissLog } from "../libs/log";
import { useLangMap } from "./I18n";
import { MSG_OPEN_TRANBOX, EVENT_KISS_INNER } from "../config";

export default function useTranboxShortcuts({
  showBox,
  setShowBox,
  handleToggleTranbox,
  handleOpenTranbox,
  contextMenuType,
  uiLang,
}) {
  const langMap = useLangMap(uiLang);

  // 快捷展开/隐藏翻译面板的切换函数
  const handleToggle = useCallback(() => {
    if (showBox) {
      setShowBox(false);
    } else {
      handleToggleTranbox();
    }
  }, [showBox, handleToggleTranbox, setShowBox]);

  // 副作用：监听自定义打开翻译面板的 DOM 通信事件（浏览器扩展快捷键触发时会广播此内部消息）
  useEffect(() => {
    const handleStatusUpdate = (event) => {
      if (event.detail?.action === MSG_OPEN_TRANBOX) {
        const text = event.detail?.args?.text?.trim();
        if (text) {
          handleOpenTranbox?.(text);
          return;
        }
        handleToggle();
      }
    };

    document.addEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    return () => {
      document.removeEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    };
  }, [handleToggle, handleOpenTranbox]);

  // 副作用：注册油猴脚本专用的右键菜单/脚本管理器菜单，供用户点击菜单拉起划词翻译框
  // REVIEW: GM.registerMenuCommand 在不同的油猴运行器（如 Tampermonkey 或是 VM/Violentmonkey）中，
  // 有些版本是同步返回菜单项 ID，有些新版本或是特定环境下则是异步返回 Promise。
  // 此处直接执行 menuCommandIds.push(GM.registerMenuCommand(...))，
  // 在异步环境下会存入 Promise 实例，导致 unregisterMenuCommand 接收到 Promise 对象而清理失败或抛出异常。
  useEffect(() => {
    // 仅在油猴脚本运行环境下执行菜单绑定
    if (!isGm) {
      return;
    }

    try {
      const menuCommandIds = [];
      // 当 contextMenuType 不为 0 时（表明启用菜单项），注册“翻译选中文字”菜单项
      contextMenuType !== 0 &&
        menuCommandIds.push(
          GM.registerMenuCommand?.(
            langMap("translate_selected_text"),
            (event) => {
              handleToggleTranbox();
            },
            "S"
          )
        );

      // 组件卸载时销毁注册的菜单项，释放资源
      return () => {
        menuCommandIds.forEach((id) => {
          GM.unregisterMenuCommand?.(id);
        });
      };
    } catch (err) {
      kissLog("registerMenuCommand", err);
    }
  }, [handleToggleTranbox, contextMenuType, langMap]);
}
