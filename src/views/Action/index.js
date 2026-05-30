import ThemeProvider from "../../hooks/Theme";
import Draggable from "./Draggable";
import { useEffect, useMemo, useCallback, useState } from "react";
import { SettingProvider } from "../../hooks/Setting";
import Header from "../Popup/Header";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import useWindowSize from "../../hooks/WindowSize";
import {
  EVENT_KISS_INNER,
  MSG_OPEN_OPTIONS,
  MSG_POPUP_TOGGLE,
} from "../../config";
import PopupCont from "../Popup/PopupCont";
import { isExt } from "../../libs/client";
import { sendBgMsg } from "../../libs/msg";

/**
 * 内容页悬浮控制面板的主入口视图组件
 * 负责当用户点击翻译悬浮球时，在页面中央弹出一个浮动的选项设置及网页翻译状态控制面板 (PopupCont)
 */
export default function Action({ translator, processActions }) {
  const [showPopup, setShowPopup] = useState(true); // 是否显示弹窗面板
  const [rule, setRule] = useState(translator.rule); // 当前网页翻译规则状态缓存
  const [setting, setSetting] = useState(translator.setting); // 全局配置状态缓存
  const windowSize = useWindowSize();

  // 点击“设置”图标，在浏览器新标签页中打开扩展 Options 设置页
  const handleOpenSetting = useCallback(() => {
    if (isExt) {
      sendBgMsg(MSG_OPEN_OPTIONS);
    } else {
      window.open(process.env.REACT_APP_OPTIONSPAGE, "_blank");
    }
  }, []);

  // 绑定挂载副作用：点击页面空白区域（window 外部）时自动收起面板
  useEffect(() => {
    const handleWindowClick = () => {
      setShowPopup(false);
    };
    window.addEventListener("click", handleWindowClick);
    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

  // 订阅扩展的自定义内部广播消息，用以接收点击悬浮球等动作触发的展开/收起面板信号
  useEffect(() => {
    const handleStatusUpdate = (event) => {
      if (event.detail?.action === MSG_POPUP_TOGGLE) {
        setShowPopup((pre) => !pre);
      }
    };

    document.addEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    return () => {
      document.removeEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    };
  }, []);

  // 当面板被打开时，拉取并同步 Translator 最新生效的规则与设置状态数据
  useEffect(() => {
    if (showPopup) {
      setRule(translator.rule);
      setSetting(translator.setting);
    }
  }, [showPopup, translator]);

  // 根据当前视口尺寸计算弹出面板的理想定位与尺寸，保证其限制在屏幕视口内并居中显示
  const popProps = useMemo(() => {
    const width = Math.min(windowSize.w, 360);
    const height = Math.min(windowSize.h, 442);
    const left = (windowSize.w - width) / 2;
    const top = (windowSize.h - height) / 2;
    return {
      windowSize,
      width,
      height,
      left,
      top,
    };
  }, [windowSize]);

  return (
    <SettingProvider context="contentPopup">
      <ThemeProvider>
        {showPopup && (
          <Draggable
            key="pop"
            {...popProps}
            usePaper // 启用阴影卡片卡纸背景
            handler={
              // 指针按下此 Header 区域可以整体拖动面板
              <Box style={{ cursor: "move" }}>
                <Header
                  onClose={() => {
                    setShowPopup(false);
                  }}
                />
                <Divider />
              </Box>
            }
          >
            <Box width={360}>
              <PopupCont
                rule={rule}
                setting={setting}
                setRule={setRule}
                setSetting={setSetting}
                handleOpenSetting={handleOpenSetting}
                processActions={processActions}
                isContent={true} // 标明是直接嵌入在网页内容上的浮层面板，而不是浏览器扩展栏顶部的 popup 面板
              />
            </Box>
          </Draggable>
        )}
      </ThemeProvider>
    </SettingProvider>
  );
}
