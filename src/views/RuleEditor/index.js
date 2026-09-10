import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import AddIcon from "@mui/icons-material/Add";
import Theme from "../../hooks/Theme";
import { SettingProvider } from "../../hooks/Setting";
import { useI18n } from "../../hooks/I18n";
import useWindowSize from "../../hooks/WindowSize";
import { describeElement } from "../../libs/ruleEditorDom";
import {
  EMPTY_SELECTOR,
  SELECTOR_FIELDS,
  splitSelectorList,
} from "../../libs/selectorList";
import { limitNumber } from "../../libs/utils";
import FloatingPanel from "./FloatingPanel";

const codeStyle = {
  fontFamily: 'Consolas, "SFMono-Regular", monospace',
  fontSize: 14,
  lineHeight: 1.6,
  overflowWrap: "anywhere",
  textTransform: "none",
  textAlign: "left",
};
// Shadow DOM still inherits the page's root rem size. Keep editor text readable
// even on sites that use a 10px root font, without changing the host page.
const themeOptions = {
  typography: {
    pxToRem: (size) => `${size}px`,
    body1: { fontSize: 16 },
    body2: { fontSize: 15 },
    caption: { fontSize: 14 },
    button: { fontSize: 15, textTransform: "none" },
  },
  components: {
    MuiButton: { styleOverrides: { sizeSmall: { fontSize: 14 } } },
    MuiChip: { styleOverrides: { label: { fontSize: 14 } } },
  },
};
const cardStyle = (selected) => ({
  border: "1px solid",
  borderColor: selected ? "primary.main" : "divider",
  bgcolor: selected ? "action.selected" : "background.paper",
  borderRadius: 1,
  overflow: "hidden",
});

function CandidateList({ session, state, t }) {
  const busy = state.saving || state.loading;
  return (
    <Stack spacing={1}>
      {!!state.ancestors.length && (
        <TextField
          select
          SelectProps={{ native: true }}
          size="small"
          label={t("element")}
          value={state.ancestors.indexOf(state.selected)}
          disabled={busy}
          onChange={(event) =>
            session.selectElement(state.ancestors[Number(event.target.value)])
          }
          inputProps={{ style: codeStyle }}
        >
          {state.ancestors.map((element, index) => (
            <option key={index} value={index}>
              {describeElement(element)}
            </option>
          ))}
        </TextField>
      )}
      {state.candidates.map((candidate) => (
        <ButtonBase
          key={candidate.selector}
          disabled={busy}
          aria-pressed={state.input === candidate.selector}
          onClick={() => {
            session.setInput(candidate.selector);
            session.refresh();
          }}
          sx={{
            ...cardStyle(state.input === candidate.selector),
            display: "block",
            p: 1.25,
            textAlign: "left",
            "&:hover": { bgcolor: "action.hover" },
            "&.Mui-focusVisible": {
              outline: "2px solid",
              outlineColor: "primary.main",
            },
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            gap={1}
          >
            <Typography variant="caption" color="text.secondary">
              {t(candidate.kind)}
            </Typography>
            <Chip size="small" label={candidate.count} />
          </Stack>
          <Box sx={{ ...codeStyle, mt: 0.5, color: "primary.main" }}>
            {candidate.selector}
          </Box>
          {candidate.fragile && (
            <Typography variant="caption" color="warning.main">
              {t("fragile")}
            </Typography>
          )}
        </ButtonBase>
      ))}
    </Stack>
  );
}

function Notice({ session, state, t }) {
  if (!state.notice) return null;
  return (
    <Alert
      severity={state.notice === "saved" ? "success" : "info"}
      onClose={() => session.emit({ notice: "" })}
    >
      {t(state.notice)}
      {state.notice === "removed-coverage" && (
        <Button
          disabled={state.saving || state.loading}
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
  );
}

export function Editor({ session, onExit }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const i18n = useI18n();
  const t = (key) => i18n(`rule_editor_${key}`, key);
  const windowSize = useWindowSize();
  const viewport = {
    w: windowSize.w || window.innerWidth,
    h: windowSize.h || window.innerHeight,
  };
  const [position, setPosition] = useState(() => ({
    x: window.innerWidth - 412,
    y: 24,
  }));
  const [inspectorPosition, setInspectorPosition] = useState(null);
  useEffect(() => {
    setInspectorPosition(null);
  }, [viewport.w, viewport.h]);
  const mainWidth = Math.min(400, viewport.w - 24);
  const inspectorWidth = Math.min(380, viewport.w - 24);
  const mainX = limitNumber(position.x, 12, viewport.w - mainWidth - 12);
  const besideX =
    mainX >= inspectorWidth + 24
      ? mainX - inspectorWidth - 12
      : mainX + mainWidth + 12;
  const adjacent = {
    x: limitNumber(besideX, 12, viewport.w - inspectorWidth - 12),
    y: position.y + (viewport.w < mainWidth + inspectorWidth + 36 ? 64 : 0),
  };
  const rule = state.context?.effective;
  const busy = state.loading || state.saving;
  const inspectorVisible =
    state.inspectorOpen && !state.picking && !state.translated;
  return (
    <>
      <FloatingPanel
        title={t("title")}
        moveLabel={t("move")}
        position={position}
        onMove={setPosition}
        width={400}
        viewport={viewport}
        actions={
          <Stack direction="row">
            <IconButton
              title={t("undo")}
              aria-label={t("undo")}
              disabled={busy || !state.undo}
              onClick={() => session.history()}
            >
              <UndoIcon fontSize="small" />
            </IconButton>
            <IconButton
              title={t("redo")}
              aria-label={t("redo")}
              disabled={busy || !state.redo}
              onClick={() => session.history(true)}
            >
              <RedoIcon fontSize="small" />
            </IconButton>
            <IconButton
              title={t("exit")}
              aria-label={t("exit")}
              disabled={state.saving}
              onClick={onExit}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
        footer={
          rule && (
            <Stack
              component="section"
              aria-label={t("pagePreview")}
              spacing={0.5}
            >
              <Typography variant="body2" fontWeight={600}>
                {t("pagePreview")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("pagePreviewHelp")}
              </Typography>
              <Stack direction="row" justifyContent="space-between">
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() => session.showWhole()}
                >
                  {t("whole")}
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() => session.showTranslation(!state.translated)}
                >
                  {t(state.translated ? "original" : "translation")}
                </Button>
              </Stack>
            </Stack>
          )
        }
      >
        <Stack spacing={2}>
          <Typography sx={codeStyle} color="text.secondary" title={t("scope")}>
            {window.location.hostname}
          </Typography>
          {state.loading && (
            <Typography role="status">{t("loading")}</Typography>
          )}
          {state.error && (
            <Alert
              severity="error"
              action={
                <Button disabled={busy} onClick={() => session.load()}>
                  {t("reload")}
                </Button>
              }
            >
              {t(state.error)}
            </Alert>
          )}
          {rule && (
            <>
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
              {(rule.scanAll === "true" ||
                rule.isPlainText === true ||
                rule.isPlainText === "true") && (
                <Alert severity="warning">{t("scanAll")}</Alert>
              )}
              <Stack
                component="section"
                aria-label={t("currentGroup")}
                spacing={1.5}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.5,
                  minWidth: 0,
                }}
              >
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
                    startIcon={<AddIcon />}
                    disabled={busy}
                    onClick={() => session.add()}
                  >
                    {t("manualAdd")}
                  </Button>
                </Stack>
                {state.picking && (
                  <Alert
                    severity="info"
                    onClose={() => {
                      session.emit({ picking: false });
                      session.refresh();
                    }}
                  >
                    {t("picking")}
                  </Alert>
                )}
                <Stack
                  spacing={1}
                  sx={{
                    // Leave room for group actions and the page preview footer.
                    maxHeight: "clamp(120px, calc(100dvh - 504px), 260px)",
                    overflowY: "auto",
                  }}
                  aria-label={t("entries")}
                >
                  {state.entries.length === 0 && (
                    <Typography color="text.secondary">{t("empty")}</Typography>
                  )}
                  {state.entries.map((entry) => (
                    <Box
                      key={entry.selector}
                      onMouseEnter={() => session.hover(entry.selector)}
                      onMouseLeave={() => session.refresh()}
                      sx={{
                        ...cardStyle(state.editing === entry.selector),
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      <ButtonBase
                        disabled={busy}
                        aria-label={entry.selector}
                        aria-pressed={state.editing === entry.selector}
                        onClick={() => session.edit(entry.selector)}
                        sx={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          p: 1.25,
                          "&:hover": { bgcolor: "action.hover" },
                          "&.Mui-focusVisible": {
                            boxShadow: "inset 0 0 0 2px",
                            color: "primary.main",
                          },
                        }}
                      >
                        <Stack direction="row" alignItems="start" gap={1}>
                          <Box
                            sx={{
                              ...codeStyle,
                              flex: 1,
                              minWidth: 0,
                              color: "primary.main",
                            }}
                          >
                            {entry.selector}
                          </Box>
                          <Chip
                            size="small"
                            color={entry.invalid ? "error" : "default"}
                            label={entry.invalid ? "!" : entry.count}
                          />
                        </Stack>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="div"
                          sx={{
                            mt: 1,
                            pr: "132px",
                            minHeight: 32,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {t(entry.source)}
                        </Typography>
                      </ButtonBase>
                      <Button
                        size="small"
                        color="inherit"
                        disabled={busy}
                        onClick={() => session.remove(entry.selector)}
                        sx={{ position: "absolute", bottom: 8, right: 8 }}
                      >
                        {t("delete")}
                      </Button>
                    </Box>
                  ))}
                </Stack>
                <Divider />
                <Stack direction="row" justifyContent="space-between" gap={1}>
                  <Button
                    size="small"
                    disabled={busy}
                    title={t("inheritHelp")}
                    onClick={() => session.save({ [state.field]: "" })}
                  >
                    {t("inherit")}
                  </Button>
                  <Button
                    size="small"
                    disabled={busy}
                    title={t("inheritHelp")}
                    onClick={() =>
                      session.save({ [state.field]: EMPTY_SELECTOR })
                    }
                  >
                    {t("clear")}
                  </Button>
                </Stack>
              </Stack>
              <Notice {...{ session, state, t }} />
            </>
          )}
          {state.saving && (
            <Typography role="status" variant="caption">
              {t("saving")}
            </Typography>
          )}
        </Stack>
      </FloatingPanel>
      {inspectorVisible && (
        <FloatingPanel
          title={t(state.editing ? "editSelector" : "candidates")}
          moveLabel={t("moveInspector")}
          position={inspectorPosition || adjacent}
          onMove={setInspectorPosition}
          width={380}
          viewport={viewport}
          actions={
            <IconButton
              title={t("closeInspector")}
              aria-label={t("closeInspector")}
              disabled={state.saving}
              onClick={() => session.closeInspector()}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          }
          footer={
            <Stack spacing={1.5}>
              <TextField
                label={t("input")}
                multiline
                minRows={2}
                maxRows={4}
                size="small"
                disabled={busy}
                value={state.input}
                error={!!state.validation}
                helperText={state.validation || undefined}
                onChange={(event) => session.setInput(event.target.value)}
                inputProps={{ spellCheck: false, style: codeStyle }}
              />
              <Button
                fullWidth
                variant="contained"
                disabled={busy || !state.input.trim() || !!state.validation}
                onClick={() => session.commitInput()}
              >
                {t(state.editing ? "update" : "add")}
              </Button>
            </Stack>
          }
        >
          <Stack spacing={2}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="body2" color="text.secondary">
                {t(state.field)}
              </Typography>
              <Button
                size="small"
                disabled={busy}
                onClick={() => session.pick()}
              >
                {t("pick")}
              </Button>
            </Stack>
            <CandidateList {...{ session, state, t }} />
            {!!state.matches.length && (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="caption">
                  {state.matches.length} {t("matches")}
                </Typography>
                <Stack direction="row" alignItems="center">
                  <Button
                    size="small"
                    aria-label={t("previous")}
                    onClick={() => session.navigate(-1)}
                  >
                    ←
                  </Button>
                  <Button
                    size="small"
                    aria-label={t("next")}
                    onClick={() => session.navigate(1)}
                  >
                    →
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </FloatingPanel>
      )}
    </>
  );
}

export default function RuleEditor(props) {
  return (
    <SettingProvider context="ruleEditor">
      <Theme options={themeOptions}>
        <Editor {...props} />
      </Theme>
    </SettingProvider>
  );
}
