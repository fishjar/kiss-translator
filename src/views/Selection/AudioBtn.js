import IconButton from "@mui/material/IconButton";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useState } from "react";
import { useAudio } from "../../hooks/Audio";
import { canSpeak, speak } from "../../libs/speech";
import queryString from "query-string";

/**
 * 基础发音/音频播放按钮组件
 *
 * @param {Object} props
 * @param {string} props.src - 音频源的 URL 地址
 */
export function AudioBtn({ src }) {
  // 使用自定义的 useAudio 控制音频加载与播放状态
  const { error, ready, playing, onPlay } = useAudio(src);

  // 如果加载音频出错或音频尚未准备就绪，显示禁用的发音图标
  if (error || !ready) {
    return (
      <IconButton disabled size="small">
        <VolumeUpIcon fontSize="inherit" />
      </IconButton>
    );
  }

  // 如果当前音频正在播放，图标高亮为 primary 主题色
  if (playing) {
    return (
      <IconButton color="primary" size="small">
        <VolumeUpIcon fontSize="inherit" />
      </IconButton>
    );
  }

  // 默认正常就绪状态，点击时调用 onPlay 开始播放
  return (
    <IconButton onClick={onPlay} size="small">
      <VolumeUpIcon fontSize="inherit" />
    </IconButton>
  );
}

/**
 * 百度翻译 TTS 发音按钮组件
 *
 * @param {Object} props
 * @param {string} props.text - 需要发音的文本
 * @param {string} [props.lan="uk"] - 语言发音口音配置 (英音 "uk", 美音 "en")
 * @param {number} [props.spd=3] - 语速配置，默认为 3
 */
export function BaiduAudioBtn({ text, lan = "uk", spd = 3 }) {
  if (!text) return null;

  // 拼接百度翻译 TTS 获取语音的公开接口 URL
  const src = `https://fanyi.baidu.com/gettts?${queryString.stringify({ lan, text, spd })}`;
  return <AudioBtn src={src} />;
}

export function BrowserTtsBtn({ text, lang = "en-US" }) {
  const [speaking, setSpeaking] = useState(false);

  if (!text?.trim() || !canSpeak()) return null;

  const handleSpeak = () => {
    if (speaking) return;

    // 浏览器内置 TTS 没有 audio 元素，因此由按钮自身维护播放状态。
    setSpeaking(true);
    const started = speak(text, lang, {
      onEnd: () => setSpeaking(false),
    });

    if (!started) {
      setSpeaking(false);
    }
  };

  return (
    <IconButton
      color={speaking ? "primary" : "default"}
      // 对齐默认词典按钮：播放中高亮，并忽略重复点击。
      onClick={speaking ? undefined : handleSpeak}
      size="small"
      sx={{ ml: 0.5, verticalAlign: "middle" }}
    >
      <VolumeUpIcon fontSize="inherit" />
    </IconButton>
  );
}
