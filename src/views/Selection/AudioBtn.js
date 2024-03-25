import IconButton from "@mui/material/IconButton";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useTextAudio } from "../../hooks/Audio";

export default function AudioBtn({ text, lan = "uk" }) {
  const { error, ready, playing, onPlay } = useTextAudio(text, lan);

  if (error || !ready) {
    return (
      <IconButton disabled>
        <VolumeUpIcon />
      </IconButton>
    );
  }

  if (playing) {
    return (
      <IconButton color="primary">
        <VolumeUpIcon />
      </IconButton>
    );
  }

  return (
    <IconButton onClick={onPlay}>
      <VolumeUpIcon />
    </IconButton>
  );
}
