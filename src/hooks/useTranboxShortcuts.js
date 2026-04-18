import { useEffect, useCallback } from "react";
import { isGm } from "../libs/client";
import { kissLog } from "../libs/log";
import { useLangMap } from "./I18n";
import { MSG_OPEN_TRANBOX, EVENT_KISS_INNER } from "../config";

export default function useTranboxShortcuts({
  showBox,
  setShowBox,
  handleToggleTranbox,
  contextMenuType,
  uiLang,
}) {
  const langMap = useLangMap(uiLang);

  const handleToggle = useCallback(() => {
    if (showBox) {
      setShowBox(false);
    } else {
      handleToggleTranbox();
    }
  }, [showBox, handleToggleTranbox, setShowBox]);

  // 监听打开翻译框的事件（浏览器扩展快捷键通过此事件触发显示/隐藏）
  useEffect(() => {
    const handleStatusUpdate = (event) => {
      if (event.detail?.action === MSG_OPEN_TRANBOX) {
        handleToggle();
      }
    };

    document.addEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    return () => {
      document.removeEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    };
  }, [handleToggle]);

  // 注册油猴脚本菜单（显示翻译框）
  useEffect(() => {
    if (!isGm) {
      return;
    }

    // 注册菜单
    try {
      const menuCommandIds = [];
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
