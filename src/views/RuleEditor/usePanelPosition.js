import { useState } from "react";
import { useStorage } from "../../hooks/Storage";

export default function usePanelPosition(key) {
  const { data, save, isLoading } = useStorage(key);
  const [moving, setMoving] = useState(null);
  const saved =
    Number.isFinite(data?.x) && Number.isFinite(data?.y) ? data : null;
  return {
    position: moving || saved,
    onMove: setMoving,
    onMoveEnd: save,
    isLoading,
  };
}
