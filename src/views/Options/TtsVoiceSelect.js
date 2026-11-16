import { useEffect, useState } from "react";
import { TextField, MenuItem } from "@mui/material";
import { useI18n } from "../../hooks/I18n";
import {
  localTtsVoiceOptions,
  defaultLocalTtsVoice,
} from "../../localAi/core/ttsVoices";
import { getSpeechVoices } from "../../libs/speech";
import { OPT_TRANS_SYSTEM_TTS } from "../../config/apiConstants";

export default function TtsVoiceSelect({ api, onChange }) {
  const i18n = useI18n();
  const system = api.apiType === OPT_TRANS_SYSTEM_TTS;
  const [systemVoices, setSystemVoices] = useState([]);
  useEffect(() => {
    if (!system) return;
    let active = true;
    const refresh = () => {
      void getSpeechVoices().then((voices) => {
        if (active) setSystemVoices(voices);
      });
    };
    refresh();
    const chromeEvent = globalThis.chrome?.tts?.onVoicesChanged;
    const synth = globalThis.speechSynthesis;
    chromeEvent?.addListener(refresh);
    synth?.addEventListener("voiceschanged", refresh);
    return () => {
      active = false;
      chromeEvent?.removeListener(refresh);
      synth?.removeEventListener("voiceschanged", refresh);
    };
  }, [system]);
  const options = system
    ? [{ value: "", label: "" }, ...systemVoices]
    : localTtsVoiceOptions(api.modelRef);
  if (!options.length) return null;
  const voice = api.voice || (system ? "" : defaultLocalTtsVoice(api.modelRef));
  return (
    <TextField
      select
      fullWidth
      size="small"
      name="voice"
      label={i18n("plugin_voice", "音色")}
      value={voice}
      SelectProps={{ displayEmpty: true }}
      InputLabelProps={{ shrink: true }}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label || i18n("service_default_voice", "默认音色")}
        </MenuItem>
      ))}
      {voice && !options.some((option) => option.value === voice) && (
        <MenuItem value={voice}>{voice}</MenuItem>
      )}
    </TextField>
  );
}
