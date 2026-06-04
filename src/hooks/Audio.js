import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../libs/log";
import { fetchData } from "../libs/fetch";

/**
 * 音频播放自定义 Hook，支持异步获取音频源、播放、暂停及播放状态同步管理
 * @param {string} src 音频资源 URL
 * @returns
 */
export function useAudio(src) {
  const audioRef = useRef(null);
  const [error, setError] = useState(null); // 错误状态
  const [ready, setReady] = useState(false); // 音频是否准备好播放
  const [playing, setPlaying] = useState(false); // 当前是否在播放中
  const [loading, setLoading] = useState(false); // 音频数据是否在加载中

  // 播放音频
  const onPlay = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
    } catch (err) {
      logger.info("Playback failed:", err);
      setPlaying(false);
    }
  }, []);

  // 暂停音频
  const onPause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  // 监听音频源变化，负责异步 fetch 音频数据及事件监听器绑定
  useEffect(() => {
    if (!src) return;

    let ignore = false; // 防止组件卸载或 src 改变后异步回调触发状态更新
    let objectUrl = null;

    setReady(false);
    setError(null);
    setPlaying(false);
    setLoading(true);

    const audio = new Audio();
    audioRef.current = audio;

    // 事件处理函数
    const handleCanPlay = () => setReady(true);
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);
    const handleError = (e) => {
      if (!ignore) {
        setError(audio.error || e);
        setReady(false);
        setLoading(false);
      }
    };

    // 绑定音频播放相关的事件监听器
    audio.addEventListener("canplaythrough", handleCanPlay);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    // 异步加载音频数据（使用经过代理的 fetchData，规避跨域限制）
    const loadAudio = async () => {
      try {
        const data = await fetchData(src, {}, { expect: "audio" });
        if (ignore) return;

        // REVIEW: 这里的 objectUrl 声明了但未被赋值（在 loadAudio 内部成功拿到 data 后，没有将 data 赋值给外层的 objectUrl 变量）。
        // 这会导致在组件卸载或 src 改变触发 cleanup 时，URL.revokeObjectURL(objectUrl) 不起作用（objectUrl 依然为 null）。
        // 如果 fetchData 返回的是通过 URL.createObjectURL 生成的 Blob URL，将会引发内存泄漏。
        audio.src = data;

        setLoading(false);
      } catch (err) {
        if (!ignore) {
          logger.info("Audio fetch failed:", err);
          setError(err);
          setLoading(false);
        }
      }
    };

    loadAudio();

    // 清理函数：暂停播放，移除事件绑定，释放 URL 资源
    return () => {
      ignore = true;

      audio.pause();
      audio.removeAttribute("src");

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      audio.removeEventListener("canplaythrough", handleCanPlay);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [src]);

  return {
    loading,
    error,
    ready,
    playing,
    onPlay,
    onPause,
  };
}
