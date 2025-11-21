import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../libs/log";
import { fetchData } from "../libs/fetch";

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
  const [loading, setLoading] = useState(false);

  const onPlay = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
    } catch (err) {
      logger.info("Playback failed:", err);
      setPlaying(false);
    }
  }, []);

  const onPause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!src) return;

    let ignore = false;
    let objectUrl = null;

    setReady(false);
    setError(null);
    setPlaying(false);
    setLoading(true);

    const audio = new Audio();
    audioRef.current = audio;

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

    audio.addEventListener("canplaythrough", handleCanPlay);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    const loadAudio = async () => {
      try {
        const data = await fetchData(src, {}, { expect: "audio" });
        if (ignore) return;

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
