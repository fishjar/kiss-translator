import IconButton from "@mui/material/IconButton";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useTextAudio } from "../../hooks/Audio";

export default function AudioBtn({ text, lan = "uk" }) {
  const { error, ready, playing, onPlay } = useTextAudio(text, lan);

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
