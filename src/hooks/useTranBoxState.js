import { useState, useEffect } from "react";
import { limitNumber } from "../libs/utils";
import { isMobile } from "../libs/mobile";
import { debouncePutTranBox, getTranBox } from "../libs/storage";
import { isIframe } from "../libs/iframe";
import {
  getMaxTranBoxContentWidth,
  getMaxTranBoxContentHeight,
  getMaxTranBoxX,
  getMaxTranBoxY,
  getTranBoxOuterWidth,
  getTranBoxOuterHeight,
} from "../libs/tranboxPosition";

/**
 * 限制翻译框的尺寸和位置，确保其不会溢出当前浏览器视口
 * @param {Object} size 当前翻译框的内容尺寸 {w, h}
 * @param {Object} position 当前翻译框的坐标位置 {x, y}
 * @returns {Object} 修正后的安全尺寸和位置 {size, position}
 */
function clampTranBoxBounds(size, position) {
  const nextW = Math.min(size.w, getMaxTranBoxContentWidth());
  const nextH = Math.min(size.h, getMaxTranBoxContentHeight());

  return {
    size: {
      w: nextW,
      h: nextH,
    },
    position: {
      x: limitNumber(position.x, 0, getMaxTranBoxX(nextW)),
      y: limitNumber(position.y, 0, getMaxTranBoxY(nextH)),
    },
  };
}

/**
 * 划词翻译框位置、尺寸及基础风格状态管理器自定义 Hook
 *
 * // REVIEW: 1. 属性变更不同步隐患。
 * //    `simpleStyle`、`hideClickAway`、`followSelection` 等状态是由初始传入的 `tranboxSetting` 属性进行 `useState` 初始化的。
 * //    如果用户在后续运行中，通过设置页面或控制面板动态修改了这些全局配置（导致传入的 `tranboxSetting` 改变），
 * //    本 Hook 内部的 state 不会同步接收并更新，导致翻译框依然处于挂载时的陈旧状态。
 * //    推荐通过 `useEffect` 监听 `tranboxSetting` 的改变并调用对应的 `set` 函数进行状态同步。
 */
export default function useTranBoxState(tranboxSetting) {
  // 解构获取翻译面板的初始参数设置项
  const {
    simpleStyle: initSimpleStyle = false,
    hideClickAway: initHideClickAway = false,
    followSelection: initFollowMouse = false,
    boxOffsetX = 0,
    boxOffsetY = 10,
  } = tranboxSetting;

  // 根据当前分辨率和极简模式风格，计算初始理想宽度。若为极简/移动端则采用 400，否则在 400 ~ 800 之间取当前窗口宽度的合适范围。
  const maxBoxWidth = getMaxTranBoxContentWidth();
  const defaultBoxWidth =
    isMobile || initSimpleStyle
      ? 400
      : limitNumber(window.innerWidth, 400, 800);
  const boxWidth = Math.min(defaultBoxWidth, maxBoxWidth);
  // 计算初始理想高度。若为极简/移动端则采用 200，否则在 200 ~ 600 之间取当前窗口高度的合适范围。
  const maxBoxHeight = getMaxTranBoxContentHeight();
  const defaultBoxHeight =
    isMobile || initSimpleStyle ? 200 : limitNumber(maxBoxHeight, 200, 600);
  const boxHeight = Math.min(defaultBoxHeight, maxBoxHeight);

  // 面板尺寸状态管理 (w: 宽, h: 高)
  const [boxSize, setBoxSize] = useState({
    w: boxWidth,
    h: boxHeight,
  });

  // 面板位置状态管理 (x: 左间距, y: 顶间距)
  const [boxPosition, setBoxPosition] = useState({
    x: (window.innerWidth - getTranBoxOuterWidth(boxWidth)) / 2,
    y: (window.innerHeight - getTranBoxOuterHeight(boxHeight)) / 2,
  });

  // 极简样式状态
  const [simpleStyle, setSimpleStyle] = useState(initSimpleStyle);
  // 点击空白处是否收起状态
  const [hideClickAway, setHideClickAway] = useState(initHideClickAway);
  // 是否跟随文字选区定位状态
  const [followSelection, setFollowSelection] = useState(initFollowMouse);

  // 首次挂载副作用：从 Storage 中读取之前保存的持久化翻译面板尺寸和位置，并根据当前浏览器窗口边界重新进行溢出修正
  useEffect(() => {
    (async () => {
      try {
        const { w, h, x, y } = (await getTranBox()) || {};
        const next = clampTranBoxBounds(
          {
            w: w !== undefined ? w : boxWidth,
            h: h !== undefined ? h : boxHeight,
          },
          {
            x: x !== undefined ? x : boxPosition.x,
            y: y !== undefined ? y : boxPosition.y,
          }
        );

        if (w !== undefined && h !== undefined) {
          setBoxSize(next.size);
        }
        if (x !== undefined && y !== undefined) {
          setBoxPosition(next.position);
        }
      } catch (err) {
        // 忽略异常
      }
    })();
  }, []);

  // 监听浏览器窗口大小变化，动态限制翻译框边界，防止窗口缩小导致翻译框被挤出屏幕
  useEffect(() => {
    function handleResize() {
      const next = clampTranBoxBounds(boxSize, boxPosition);
      setBoxSize(next.size);
      setBoxPosition(next.position);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [boxSize, boxPosition]);

  // 副作用：当翻译面板的大小 (boxSize) 或位置 (boxPosition) 发生改变时，防抖式将其写入存储进行持久化保存
  // 注意：在 iframe 内运行时，不触发持久化，避免多框架环境读写冲突导致布局错乱
  useEffect(() => {
    if (!isIframe && boxSize.w > 0 && boxSize.h > 0) {
      debouncePutTranBox({
        ...boxSize,
        ...boxPosition,
      });
    }
  }, [boxSize, boxPosition]);

  return {
    boxSize,
    setBoxSize,
    boxPosition,
    setBoxPosition,
    simpleStyle,
    setSimpleStyle,
    hideClickAway,
    setHideClickAway,
    followSelection,
    setFollowSelection,
    boxOffsetX,
    boxOffsetY,
  };
}
