import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVENT_KISS_INNER,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
} from "../config";
import { sendTabMsg } from "../libs/msg";
import { useMouseHoverSetting } from "./MouseHover";

export function useTouchState(processActions) {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  // 状态纪元：模式变更派发或页面广播被采纳时递增；早于该时刻发出的
  // STATE 查询应答一律视为过期丢弃。
  const epochRef = useRef(0);
  // 页面是否已回报过状态：提交失败且从未拿到状态时补发一次查询。
  const stateSeenRef = useRef(false);
  const { updateMouseHoverSetting } = useMouseHoverSetting();
  const dispatch = useCallback(
    async (action, args) => {
      // MODE_SET 派发即递增并捕获新值，其应答永不因纪元过期；STATE 查询
      // 发出时登记纪元，应答到达时纪元已前进则过期丢弃（零副作用）。
      if (action === MSG_TOUCH_TRANSLATE_MODE_SET) epochRef.current += 1;
      const queryEpoch =
        action === MSG_TOUCH_TRANSLATE_STATE ? epochRef.current : null;
      try {
        const result = processActions
          ? await processActions({ action, args })
          : await sendTabMsg(action, args, { frameId: 0 });
        if (!result?.touchTranslate)
          throw new Error("Missing touch translation state");
        if (
          action === MSG_TOUCH_TRANSLATE_MODE_SET &&
          (result.touchTranslate.mode !== args.mode ||
            (args.direction &&
              result.touchTranslate.direction !== args.direction))
        )
          throw new Error("Page rejected touch mode");
        if (queryEpoch === null || queryEpoch === epochRef.current) {
          stateSeenRef.current = true;
          setState(result.touchTranslate);
          // 只有成功落位的提交确认此前失败可以撤销；纯状态读取
          // 不代表此前的提交被页面接受。
          if (action === MSG_TOUCH_TRANSLATE_MODE_SET) setFailed(false);
        }
        return result.touchTranslate;
      } catch {
        if (action === MSG_TOUCH_TRANSLATE_MODE_SET) setFailed(true);
        return null;
      }
    },
    [processActions]
  );
  useEffect(() => {
    dispatch(MSG_TOUCH_TRANSLATE_STATE);
    const update = (event) => {
      if (
        event.detail?.action === MSG_TOUCH_TRANSLATE_STATE &&
        event.detail?.touchTranslate
      ) {
        // 页面广播比任何在途 STATE 查询新：采纳并使在途应答过期。
        epochRef.current += 1;
        stateSeenRef.current = true;
        setState(event.detail.touchTranslate);
      }
    };
    document.addEventListener(EVENT_KISS_INNER, update);
    return () => document.removeEventListener(EVENT_KISS_INNER, update);
  }, [dispatch]);
  const change = async (mode, direction) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setSaveFailed(false);
    try {
      const result = await dispatch(MSG_TOUCH_TRANSLATE_MODE_SET, {
        mode,
        ...(direction ? { direction } : {}),
      });
      if (result?.mode === mode) {
        try {
          await updateMouseHoverSetting({
            touchMode: mode,
            ...(direction ? { touchDirection: direction } : {}),
          });
        } catch {
          setSaveFailed(true);
        }
      } else if (!stateSeenRef.current) {
        // 提交失败且此前从未拿到页面状态：补发一次查询恢复可见性，
        // 失败提示保留到下一次提交成功；查询只发不等，互斥锁照常释放。
        dispatch(MSG_TOUCH_TRANSLATE_STATE);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  return { state, failed, saveFailed, pending, change };
}
