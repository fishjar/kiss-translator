import IconButton from "@mui/material/IconButton";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useAudio } from "../../hooks/Audio";
import queryString from "query-string";

export function AudioBtn({ src }) {
  const { error, ready, playing, onPlay } = useAudio(src);

  if (error || !ready) {
    return (
      <IconButton disabled size="small">
        <VolumeUpIcon fontSize="inherit" />
      </IconButton>
    );
  }

  if (playing) {
    return (
      <IconButton color="primary" size="small">
        <VolumeUpIcon fontSize="inherit" />
      </IconButton>
    );
  }

  return (
    <IconButton onClick={onPlay} size="small">
      <VolumeUpIcon fontSize="inherit" />
    </IconButton>
  );
}

export function BaiduAudioBtn({ text, lan = "uk", spd = 3 }) {
  if (!text) return null;

  const src = `https://fanyi.baidu.com/gettts?${queryString.stringify({ lan, text, spd })}`;
  return <AudioBtn src={src} />;
}
