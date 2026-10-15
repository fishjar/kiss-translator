import { useI18n } from "../../hooks/I18n";
import { ServiceTestCard } from "./ServiceForm";
import { capabilityLabelKeys } from "../../providers/capabilityLabels";
import { enabledApiCapabilities } from "../../config/serviceSelection";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, MenuItem, TextField } from "@mui/material";
import {
  createTestInput,
  structuredTestSamples,
} from "../../providers/testInput";
import { invokeService } from "../../providers/serviceRuntime";
import { createAssetStore } from "../../providers/transport";
import { applyTestPrompt } from "../../providers/testInput";
import { resolveApiPromptSettings } from "../../config/prompt";
import { usePromptList } from "../../hooks/Prompt";
import { useSetting } from "../../hooks/Setting";

/** Native test calls the same compiled capability entry as scenes; no user-script grant/Sval. */
export default function NativeCapabilityTest({ api, translationTest }) {
  const i18n = useI18n();
  const { prompts } = usePromptList();
  const { setting } = useSetting();
  const [names, setNames] = useState(() => enabledApiCapabilities(api));
  const [capability, setCapability] = useState(
    () => enabledApiCapabilities(api)[0] || ""
  );
  const [text, setText] = useState("Hello");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const active = useRef(null);
  useEffect(() => {
    let alive = true;
    import("../../builtin-plugins/capabilities")
      .then(({ resolveBuiltinCapabilities }) => resolveBuiltinCapabilities(api))
      .then((capabilities) => {
        if (!alive) return;
        const names = enabledApiCapabilities(api);
        setNames(names);
        if (!names.includes(capability)) {
          const next = names[0] || "";
          setCapability(next);
          setText(
            structuredTestSamples[next]
              ? JSON.stringify(structuredTestSamples[next], null, 2)
              : "Hello"
          );
        }
      })
      .catch((error) => {
        if (alive) {
          setNames([]);
          setError(error.message);
        }
      });
    return () => {
      alive = false;
    };
  }, [api, capability]);
  useEffect(
    () => () => {
      active.current?.cancel();
      active.current = null;
    },
    []
  );
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl]
  );
  const test = async () => {
    setBusy(true);
    setError("");
    setResult("");
    setAudioUrl("");
    const assets = createAssetStore();
    const job = { cancel() {} };
    active.current = job;
    try {
      const resolvedApi = resolveApiPromptSettings(
        api,
        prompts,
        setting?.subtitleSetting
      );
      const input = applyTestPrompt(
        capability,
        createTestInput(capability, text, file, assets),
        resolvedApi
      );
      const call = invokeService(resolvedApi, capability, input, {
        assets,
        timeoutMs: 60000,
        streaming: "auto",
      });
      job.cancel = call.cancel;
      const output = await call.result;
      if (active.current !== job) return;
      if (output.audio)
        setAudioUrl(URL.createObjectURL(assets.get(output.audio)));
      setResult(JSON.stringify(output, null, 2));
    } catch (err) {
      if (active.current === job) setError(err.message);
    } finally {
      assets.clear();
      if (active.current === job) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <ServiceTestCard
      actions={
        <>
          <Button disabled={busy || !names.includes(capability)} onClick={test}>
            {i18n("plugin_run_test")}
          </Button>
          <Button disabled={!busy} onClick={() => active.current?.cancel()}>
            {i18n("cancel")}
          </Button>
          {names.includes("translate") && translationTest}
        </>
      }
    >
      {!names.length ? (
        <Alert severity="info">{i18n("plugin_no_capabilities_enabled")}</Alert>
      ) : (
        <>
          <TextField
            select
            size="small"
            label={i18n("plugin_test_capability")}
            value={names.includes(capability) ? capability : ""}
            onChange={(event) => {
              const name = event.target.value;
              setCapability(name);
              setText(
                structuredTestSamples[name]
                  ? JSON.stringify(structuredTestSamples[name], null, 2)
                  : "Hello"
              );
            }}
          >
            {names.map((name) => (
              <MenuItem key={name} value={name}>
                {i18n(capabilityLabelKeys[name], name)}
              </MenuItem>
            ))}
          </TextField>
          {[
            "recognizeText",
            "parseImage",
            "analyzeLayout",
            "transcribe",
          ].includes(capability) ? (
            <input
              type="file"
              accept={capability === "transcribe" ? "audio/*" : "image/*"}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          ) : (
            <TextField
              multiline
              minRows={2}
              label={
                structuredTestSamples[capability]
                  ? i18n("plugin_task_json")
                  : i18n("plugin_test_text")
              }
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          )}

          {error && <Alert severity="error">{error}</Alert>}
          {result && (
            <TextField
              multiline
              label={i18n("plugin_result")}
              maxRows={12}
              value={result}
              InputProps={{ readOnly: true }}
            />
          )}
          {audioUrl && <audio controls src={audioUrl} />}
        </>
      )}
    </ServiceTestCard>
  );
}
