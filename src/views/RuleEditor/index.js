import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Theme from "../../hooks/Theme";
import { SettingProvider } from "../../hooks/Setting";
import { useI18n } from "../../hooks/I18n";
import { describeElement } from "../../libs/ruleEditorDom";
import {
  EMPTY_SELECTOR,
  SELECTOR_FIELDS,
  splitSelectorList,
} from "../../libs/selectorList";

const codeStyle = {
  fontFamily: 'Consolas, "SFMono-Regular", monospace',
  fontSize: 12,
  overflowWrap: "anywhere",
  textTransform: "none",
  textAlign: "left",
};
const panelStyle = {
  position: "fixed",
  zIndex: 2147483647,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2,
  overflow: "auto",
  boxShadow: "0 12px 48px #0003",
};

function CandidateList({ session, state, t }) {
  const busy = state.saving || state.loading;
  return (
    <Stack spacing={0.8}>
      <Typography variant="subtitle2">{t("candidates")}</Typography>
      <Typography variant="caption" color="text.secondary">
        {t("candidateHelp")}
      </Typography>
      <Stack direction="row" gap={0.5} flexWrap="wrap" aria-label={t("pick")}>
        {state.ancestors.map((element, index) => (
          <Button
            key={index}
            disabled={busy}
            size="small"
            sx={{ ...codeStyle, minWidth: 0, p: 0.5 }}
            onClick={() => session.selectElement(element)}
          >
            {describeElement(element)}
          </Button>
        ))}
      </Stack>
      {state.candidates.map((candidate) => (
        <Button
          key={candidate.selector}
          disabled={busy}
          variant={state.input === candidate.selector ? "outlined" : "text"}
          onClick={() => {
            session.setInput(candidate.selector);
            session.refresh();
          }}
          sx={{
            display: "block",
            textAlign: "left",
            p: 1,
            border: "1px solid",
            borderColor:
              state.input === candidate.selector ? "primary.main" : "divider",
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="caption" color="text.secondary">
              {t(candidate.kind)}
            </Typography>
            <Chip size="small" label={candidate.count} />
          </Stack>
          <Box sx={{ ...codeStyle, mt: 0.5 }}>{candidate.selector}</Box>
          {candidate.fragile && (
            <Typography variant="caption" color="warning.main">
              {t("fragile")}
            </Typography>
          )}
        </Button>
      ))}
      <Box
        sx={{
          position: "sticky",
          bottom: -12,
          bgcolor: "background.paper",
          py: 1,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="caption" display="block">
          {t(state.field)}
        </Typography>
        <Button
          fullWidth
          variant="contained"
          disabled={busy || !state.input.trim() || !!state.validation}
          onClick={() => session.commitInput()}
        >
          {t(state.editing ? "update" : "add")}
        </Button>
      </Box>
    </Stack>
  );
}

function Editor({ session, onExit }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const i18n = useI18n();
  const t = (key) => i18n(`rule_editor_${key}`, key);
  const [anchor, setAnchor] = useState(null);
  useEffect(() => {
    if (!state.selected) {
      setAnchor(null);
      return;
    }
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = state.selected.getBoundingClientRect();
        const minLeft = state.side === "left" ? 406 : 12;
        const maxLeft =
          window.innerWidth - (state.side === "right" ? 720 : 326);
        setAnchor({
          left: Math.max(minLeft, Math.min(rect.right + 12, maxLeft)),
          top: Math.max(12, Math.min(rect.top, window.innerHeight - 420)),
          compact: window.innerWidth < 1000,
        });
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [state.selected, state.side]);
  const rule = state.context?.effective;
  const busy = state.loading || state.saving;
  const entryCount = state.matches.length;
  return (
    <>
      <Paper
        component="aside"
        aria-label={t("title")}
        sx={{
          ...panelStyle,
          top: 12,
          bottom: 12,
          [state.side]: 12,
          width: 376,
          maxWidth: "calc(100vw - 24px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ p: 2, borderTop: "4px solid #168aad" }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography
              variant="overline"
              sx={{ letterSpacing: 2, color: "primary.main" }}
            >
              KISS / SITE RULES
            </Typography>
            <Button size="small" disabled={state.saving} onClick={onExit}>
              {t("exit")}
            </Button>
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("title")}
          </Typography>
          <Typography sx={{ ...codeStyle, mt: 0.5 }}>
            {window.location.hostname}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("scope")}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ overflowY: "auto", p: 2, flex: 1 }}>
          <Stack spacing={1.5}>
            {state.loading && (
              <Typography role="status">{t("loading")}</Typography>
            )}
            {state.error && (
              <Alert
                severity="error"
                action={
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => session.load()}
                  >
                    {t("reload")}
                  </Button>
                }
              >
                {t(state.error)}
              </Alert>
            )}
            {rule && (
              <>
                <Stack direction="row" gap={1}>
                  <Button
                    variant="contained"
                    disabled={busy}
                    onClick={() => session.pick()}
                    sx={{ flex: 1 }}
                  >
                    {t("pick")}
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={busy}
                    onClick={() => session.showWhole()}
                  >
                    {t("whole")}
                  </Button>
                </Stack>
                {state.picking && <Alert severity="info">{t("picking")}</Alert>}
                <TextField
                  select
                  SelectProps={{ native: true }}
                  size="small"
                  label={t("mode")}
                  disabled={busy}
                  value={rule.autoScan}
                  onChange={(event) =>
                    session.save({ autoScan: event.target.value })
                  }
                >
                  <option value="true">{t("auto")}</option>
                  <option value="false">{t("manual")}</option>
                </TextField>
                <Typography variant="caption" color="text.secondary">
                  {t("modeHelp")}
                </Typography>
                {(rule.scanAll === "true" ||
                  rule.isPlainText === true ||
                  rule.isPlainText === "true") && (
                  <Alert severity="warning">{t("scanAll")}</Alert>
                )}
                <Box component="details" sx={{ fontSize: 12 }}>
                  <Box
                    component="summary"
                    sx={{ cursor: "pointer", color: "text.secondary" }}
                  >
                    {t("personal")} / {t("subscription")}
                  </Box>
                  <Typography variant="caption" display="block">
                    {t("personal")}:{" "}
                    {state.context.personal?.pattern || t("none")}
                  </Typography>
                  <Typography variant="caption" display="block">
                    {t("subscription")}:{" "}
                    {state.context.subscription?.pattern || t("none")}
                  </Typography>
                  {!state.context.site && (
                    <Typography
                      variant="caption"
                      display="block"
                      sx={{ mt: 1 }}
                    >
                      {t("sourceHelp")}
                    </Typography>
                  )}
                </Box>
                <Divider />
                <TextField
                  select
                  SelectProps={{ native: true }}
                  size="small"
                  label={t("purpose")}
                  value={state.field}
                  disabled={busy}
                  onChange={(event) => session.setField(event.target.value)}
                >
                  {SELECTOR_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {t(field)}
                    </option>
                  ))}
                </TextField>
                {state.entries.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {t("empty")}
                  </Typography>
                )}
                <Stack spacing={0.6} sx={{ maxHeight: 280, overflowY: "auto" }}>
                  {state.entries.map((entry) => (
                    <Box
                      key={entry.selector}
                      onMouseEnter={() => session.hover(entry.selector)}
                      onMouseLeave={() => session.refresh()}
                      sx={{
                        border: "1px solid",
                        borderColor:
                          state.editing === entry.selector
                            ? "primary.main"
                            : "divider",
                        borderRadius: 1,
                        p: 1,
                      }}
                    >
                      <Stack direction="row" alignItems="start" gap={1}>
                        <Button
                          disabled={busy}
                          onClick={() => session.edit(entry.selector)}
                          sx={{
                            ...codeStyle,
                            flex: 1,
                            justifyContent: "start",
                            p: 0,
                            minWidth: 0,
                          }}
                        >
                          {entry.selector}
                        </Button>
                        <Chip
                          size="small"
                          color={entry.invalid ? "error" : "default"}
                          label={entry.invalid ? "!" : entry.count}
                        />
                      </Stack>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography variant="caption" color="text.secondary">
                          {t(entry.source)}
                        </Typography>
                        <Button
                          size="small"
                          color="inherit"
                          disabled={busy}
                          onClick={() => session.remove(entry.selector)}
                        >
                          {t("delete")}
                        </Button>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
                <Stack direction="row" gap={1}>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => session.save({ [state.field]: "" })}
                  >
                    {t("inherit")}
                  </Button>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      session.save({ [state.field]: EMPTY_SELECTOR })
                    }
                  >
                    {t("clear")}
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {t("inheritHelp")}
                </Typography>
                {anchor?.compact && !!state.candidates.length && (
                  <CandidateList {...{ session, state, t }} />
                )}
                <TextField
                  label={t("input")}
                  multiline
                  minRows={2}
                  maxRows={5}
                  size="small"
                  disabled={busy}
                  value={state.input}
                  error={!!state.validation}
                  helperText={state.validation || " "}
                  onChange={(event) => session.setInput(event.target.value)}
                  inputProps={{ spellCheck: false, style: codeStyle }}
                />
                <Stack direction="row" gap={1}>
                  <Button
                    variant="contained"
                    disabled={busy || !state.input.trim() || !!state.validation}
                    onClick={() => session.commitInput()}
                    sx={{ flex: 1 }}
                  >
                    {t(state.editing ? "update" : "add")}
                  </Button>
                  {state.editing && (
                    <Button
                      disabled={busy}
                      onClick={() => session.emit({ editing: null })}
                    >
                      {t("cancelEdit")}
                    </Button>
                  )}
                </Stack>
                {state.notice && (
                  <Alert
                    severity={state.notice === "saved" ? "success" : "info"}
                  >
                    {t(state.notice)}
                    {state.notice === "removed-coverage" && (
                      <Button
                        disabled={busy}
                        size="small"
                        onClick={() =>
                          session.save({
                            ignoreSelector: [
                              ...new Set([
                                ...session.list("ignoreSelector"),
                                ...splitSelectorList(state.input),
                              ]),
                            ].join(", "),
                          })
                        }
                      >
                        {t("exclude")}
                      </Button>
                    )}
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </Box>
        <Box
          sx={{
            p: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "action.hover",
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="caption">
              {t(state.whole ? "whole" : "entry")}
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {entryCount} {t("matches")}
            </Typography>
          </Stack>
          <Typography variant="caption" display="block">
            {state.excluded} {t("excluded")} · {state.hidden} {t("hidden")}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {t("legend")}
          </Typography>
          <Stack direction="row" gap={0.5} sx={{ mt: 0.5 }}>
            <Button
              size="small"
              aria-label={t("previous")}
              disabled={!entryCount}
              onClick={() => session.navigate(-1)}
            >
              ←
            </Button>
            <Typography variant="caption" sx={{ alignSelf: "center" }}>
              {entryCount ? `${state.matchIndex || 1} / ${entryCount}` : "0"}
            </Typography>
            <Button
              size="small"
              aria-label={t("next")}
              disabled={!entryCount}
              onClick={() => session.navigate(1)}
            >
              →
            </Button>
            <Button
              size="small"
              disabled={busy || !rule}
              onClick={() => session.showTranslation(!state.translated)}
            >
              {t(state.translated ? "original" : "translation")}
            </Button>
          </Stack>
          <Box component="details" sx={{ fontSize: 11, my: 0.5 }}>
            <Box component="summary" sx={{ cursor: "pointer" }}>
              {t("previewHelp")}
            </Box>
            <Typography variant="caption">{t("boundary")}</Typography>
          </Box>
          <Stack direction="row" justifyContent="space-between">
            <Button
              size="small"
              disabled={busy || !state.undo}
              onClick={() => session.history()}
            >
              {t("undo")}
            </Button>
            <Button
              size="small"
              disabled={busy || !state.redo}
              onClick={() => session.history(true)}
            >
              {t("redo")}
            </Button>
            <Button
              size="small"
              onClick={() =>
                session.emit({
                  side: state.side === "right" ? "left" : "right",
                })
              }
            >
              {t("dock")}
            </Button>
          </Stack>
          {state.saving && (
            <Typography role="status" variant="caption">
              {t("saving")}
            </Typography>
          )}
        </Box>
      </Paper>
      {anchor &&
        !anchor.compact &&
        !!state.candidates.length &&
        !state.picking &&
        !state.translated && (
          <Paper
            sx={{
              ...panelStyle,
              left: anchor.left,
              top: anchor.top,
              width: 302,
              maxHeight: "min(65vh, 540px)",
              p: 1.5,
            }}
          >
            <CandidateList {...{ session, state, t }} />
          </Paper>
        )}
    </>
  );
}

export default function RuleEditor(props) {
  return (
    <SettingProvider context="ruleEditor">
      <Theme>
        <Editor {...props} />
      </Theme>
    </SettingProvider>
  );
}
