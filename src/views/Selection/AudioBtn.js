import IconButton from "@mui/material/IconButton";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useEffect, useRef, useState } from "react";
import { useAudio } from "../../hooks/Audio";
import { canSpeak, speak } from "../../libs/speech";
import queryString from "query-string";

/**
 * Basic audio playback button.
 *
 * @param {Object} props
 * @param {string} props.src - Audio source URL.
 */
export function AudioBtn({ src, title = "Speak", pauseTitle = "Pause" }) {
  // Track audio loading and playback with useAudio.
  const { error, ready, playing, onPlay, onPause } = useAudio(src);

  // Disable playback while loading or after an audio error.
  if (error || !ready) {
    return (
      <IconButton
        disabled
        size="small"
        title={title}
        aria-label={title}
        aria-busy={!error && !ready}
      >
        <VolumeUpIcon fontSize="inherit" />
      </IconButton>
    );
  }

  // Highlight the icon with the primary color during playback.
  if (playing) {
    return (
      <IconButton
        color="primary"
        size="small"
        onClick={onPause}
        title={pauseTitle}
        aria-label={pauseTitle}
        aria-pressed="true"
      >
        <VolumeUpIcon fontSize="inherit" />
      </IconButton>
    );
  }

  // Start playback when the ready button is clicked.
  return (
    <IconButton
      onClick={onPlay}
      size="small"
      title={title}
      aria-label={title}
      aria-pressed="false"
    >
      <VolumeUpIcon fontSize="inherit" />
    </IconButton>
  );
}

/**
 * Baidu Translate TTS button.
 *
 * @param {Object} props
 * @param {string} props.text - Text to speak.
 * @param {string} [props.lan="uk"] - Accent: British "uk" or American "en".
 * @param {number} [props.spd=3] - Speech rate, defaulting to 3.
 */
export function BaiduAudioBtn({ text, lan = "uk", spd = 3 }) {
  if (!text) return null;

  // Build the public Baidu Translate TTS URL.
  const src = `https://fanyi.baidu.com/gettts?${queryString.stringify({ lan, text, spd })}`;
  return <AudioBtn src={src} />;
}

export function BrowserTtsBtn({
  text,
  lang = "en-US",
  title = "Speak",
  serviceId = "",
}) {
  if (serviceId)
    return (
      <CloudTtsBtn
        text={text}
        lang={lang}
        title={title}
        serviceId={serviceId}
      />
    );
  return <NativeTtsBtn text={text} lang={lang} title={title} />;
}

function CloudTtsBtn({ text, lang, title, serviceId }) {
  const active = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const stop = () => {
    const current = active.current;
    active.current = null;
    current?.call?.cancel();
    if (current?.audio) {
      current.audio.onended = null;
      current.audio.onerror = null;
    }
    current?.audio?.pause();
    current?.call?.assets.clear();
    if (current?.url) URL.revokeObjectURL(current.url);
    setPlaying(false);
  };
  useEffect(
    () => () => {
      const current = active.current;
      active.current = null;
      if (current?.audio) {
        current.audio.onended = null;
        current.audio.onerror = null;
      }
      current?.call?.cancel();
      current?.audio?.pause();
      current?.call?.assets.clear();
      if (current?.url) URL.revokeObjectURL(current.url);
    },
    [serviceId, text, lang]
  );
  useEffect(() => {
    setPlaying(false);
    setError("");
  }, [serviceId, text, lang]);
  const play = async () => {
    if (active.current) {
      stop();
      return;
    }
    const job = {};
    active.current = job;
    setPlaying(true);
    setError("");
    try {
      const { invokeSavedService } = await import(
        "../../providers/savedService"
      );
      const { getSettingWithDefault } = await import("../../libs/storage");
      const { supportsApiCapability } = await import(
        "../../config/serviceSelection"
      );
      const instance = (await getSettingWithDefault()).transApis.find(
        (api) => api.apiSlug === serviceId
      );
      const capability =
        supportsApiCapability(instance, "speak") &&
        !supportsApiCapability(instance, "synthesizeSpeech")
          ? "speak"
          : "synthesizeSpeech";
      if (active.current !== job) return;
      job.call = invokeSavedService(serviceId, capability, {
        text,
        language: lang,
      });
      const result = await job.call.result;
      if (active.current !== job) return;
      if (capability === "speak") {
        stop();
        return;
      }
      job.url = URL.createObjectURL(job.call.assets.get(result.audio));
      job.audio = new Audio(job.url);
      job.audio.onended = () => {
        if (active.current === job) stop();
      };
      job.audio.onerror = () => {
        if (active.current === job) {
          setError("音频播放失败");
          stop();
        }
      };
      await job.audio.play();
    } catch (err) {
      if (active.current === job) {
        setError(err.message);
        stop();
      }
    }
  };
  if (!text?.trim()) return null;
  return (
    <IconButton
      size="small"
      title={error || title}
      aria-label={title}
      aria-pressed={playing}
      color={playing ? "primary" : "default"}
      onClick={play}
    >
      <VolumeUpIcon fontSize="inherit" />
    </IconButton>
  );
}

function NativeTtsBtn({ text, lang = "en-US", title = "Speak" }) {
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);

  if (!text?.trim() || !canSpeak()) return null;

  const handleSpeak = () => {
    if (speakingRef.current) return;

    // Browser TTS has no audio element, so the button tracks playback itself.
    speakingRef.current = true;
    setSpeaking(true);
    const onEnd = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    const started = speak(text, lang, { onEnd });

    if (!started) onEnd();
  };

  return (
    <IconButton
      color={speaking ? "primary" : "default"}
      // A native disabled button loses keyboard focus while speech is starting.
      aria-disabled={speaking}
      onClick={handleSpeak}
      size="small"
      title={title}
      aria-label={title}
      aria-busy={speaking}
      aria-pressed={speaking}
      sx={{
        ml: 0.5,
        verticalAlign: "middle",
        cursor: speaking ? "default" : undefined,
      }}
    >
      <VolumeUpIcon fontSize="inherit" />
    </IconButton>
  );
}
