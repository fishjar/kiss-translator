import { useEffect, useCallback } from "react";
import { shortcutRegister } from "../libs/shortcut";
import { isGm, isExt } from "../libs/client";
import { kissLog } from "../libs/log";
import { useLangMap } from "./I18n";
import {
  MSG_OPEN_TRANBOX,
  EVENT_KISS_INNER,
  DEFAULT_TRANBOX_SHORTCUT,
} from "../config";

export default function useTranboxShortcuts({
  tranboxSetting,
  showBox,
  setShowBox,
  handleToggleTranbox,
  contextMenuType,
  uiLang,
}) {
  const { tranboxShortcut = DEFAULT_TRANBOX_SHORTCUT } = tranboxSetting;
  const langMap = useLangMap(uiLang);

  const handleToggle = useCallback(() => {
    if (showBox) {
      setShowBox(false);
    } else {
      handleToggleTranbox();
    }
  }, [showBox, handleToggleTranbox, setShowBox]);

  // 注册油猴脚本快捷键
  useEffect(() => {
    if (isExt) {
      return;
    }
    const clearShortcut = shortcutRegister(tranboxShortcut, handleToggle);
    return () => {
      clearShortcut();
    };
  }, [tranboxShortcut, handleToggle]);

  // 监听打开翻译框的事件
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

  // 注册油猴脚本菜单
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
