import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaiduTTS } from "../apis";
import { kissLog } from "../libs/log";

/**
 * 声音播放hook
 * @param {*} src
 * @returns
 */
export function useAudio(src) {
  const audioRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  const onPlay = useCallback(() => {
    audioRef.current?.play();
  }, []);

  useEffect(() => {
    if (!src) {
      return;
    }
    const audio = new Audio(src);
    audio.addEventListener("error", (err) => setError(err));
    audio.addEventListener("canplaythrough", () => setReady(true));
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("ended", () => setPlaying(false));
    audioRef.current = audio;
  }, [src]);

  return {
    error,
    ready,
    playing,
    onPlay,
  };
}

/**
 * 获取语音hook
 * @param {*} text
 * @param {*} lan
 * @param {*} spd
 * @returns
 */
export function useTextAudio(text, lan = "uk", spd = 3) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setSrc(await apiBaiduTTS(text, lan, spd));
      } catch (err) {
        kissLog("baidu tts", err);
      }
    })();
  }, [text, lan, spd]);

  return useAudio(src);
}
