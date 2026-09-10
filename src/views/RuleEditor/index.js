import { useRef, useSyncExternalStore } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import AddIcon from "@mui/icons-material/Add";
import Theme from "../../hooks/Theme";
import { SettingProvider } from "../../hooks/Setting";
import { useI18n } from "../../hooks/I18n";
import {
  STOKEY_RULE_EDITOR_POSITION,
  STOKEY_RULE_INSPECTOR_POSITION,
} from "../../config";
import { describeElement } from "../../libs/ruleEditorDom";
import {
  EMPTY_SELECTOR,
  SELECTOR_FIELDS,
  splitSelectorList,
} from "../../libs/selectorList";
import { limitNumber } from "../../libs/utils";
import FloatingPanel from "./FloatingPanel";
import EditorSelect from "./EditorSelect";
import usePanelPosition from "./usePanelPosition";
import usePanelViewport from "./usePanelViewport";

const selectorLabels = {
  selector: "target_selector",
  ignoreSelector: "ignore_selector",
  rootsSelector: "root_selector",
  keepSelector: "keep_selector",
  blockSelector: "block_selector",
};
const MAIN_WIDTH = 448;

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
        <EditorSelect
          label={t("element")}
          value={state.ancestors.indexOf(state.selected)}
          disabled={busy}
          onChange={(event) =>
            session.selectElement(state.ancestors[Number(event.target.value)])
          }
          inputProps={{ style: codeStyle }}
        >
          {state.ancestors.map((element, index) => (
            <MenuItem key={index} value={index} sx={codeStyle}>
              {describeElement(element)}
            </MenuItem>
          ))}
        </EditorSelect>
      )}
      {!!state.candidates.length && (
        <Typography variant="caption" color="text.secondary">
          {t("navigateHelp")}
        </Typography>
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
            <Chip
              size="small"
              aria-live={state.input === candidate.selector ? "polite" : "off"}
              label={
                state.input === candidate.selector && state.matchIndex
                  ? `${state.matchIndex} / ${candidate.count}`
                  : candidate.count
              }
            />
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
            session.updateDraft({
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

export function Editor({ session }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const patternField = useRef(null);
  const i18n = useI18n();
  const t = (key) => i18n(`rule_editor_${key}`, key);
  const viewport = usePanelViewport();
  const mainPosition = usePanelPosition(STOKEY_RULE_EDITOR_POSITION);
  const inspectorPosition = usePanelPosition(STOKEY_RULE_INSPECTOR_POSITION);
  const position = mainPosition.position || {
    x: viewport.x + viewport.w - MAIN_WIDTH - 12,
    y: viewport.y + 24,
  };
  const mainWidth = Math.min(MAIN_WIDTH, viewport.w - 24);
  const inspectorWidth = Math.min(380, viewport.w - 24);
  const mainX = limitNumber(
    position.x,
    viewport.x + 12,
    viewport.x + viewport.w - mainWidth - 12
  );
  const besideX =
    mainX - viewport.x >= inspectorWidth + 24
      ? mainX - inspectorWidth - 12
      : mainX + mainWidth + 12;
  const adjacent = {
    x: limitNumber(
      besideX,
      viewport.x + 12,
      viewport.x + viewport.w - inspectorWidth - 12
    ),
    y: position.y + (viewport.w < mainWidth + inspectorWidth + 36 ? 64 : 0),
  };
  const rule = state.context?.effective;
  const busy = state.loading || state.saving;
  const inspectorVisible =
    state.inspectorOpen && !state.picking && !state.translated;
  if (mainPosition.isLoading || inspectorPosition.isLoading) return null;
  return (
    <>
      <FloatingPanel
        title={t("title")}
        moveLabel={t("move")}
        position={position}
        onMove={mainPosition.onMove}
        onMoveEnd={mainPosition.onMoveEnd}
        width={MAIN_WIDTH}
        viewport={viewport}
        bodySx={{
          display: "flex",
          flexDirection: "column",
          p: viewport.h < 780 ? 1.5 : 2,
        }}
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
              onClick={() => session.requestAction("exit")}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
        footer={
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="stretch">
              {rule && (
                <Stack
                  component="section"
                  aria-label={t("pagePreview")}
                  direction="row"
                  spacing={1}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    "& .MuiToggleButton-root": {
                      minHeight: 36,
                      px: 1,
                      py: 0.75,
                      fontSize: 14,
                      lineHeight: 1.4,
                      textTransform: "none",
                    },
                  }}
                >
                  <ToggleButton
                    value="scope"
                    size="small"
                    color="primary"
                    selected={!!state.whole}
                    disabled={busy}
                    title={t("pagePreviewHelp")}
                    onClick={() => session.showWhole()}
                    sx={{ flex: 1.4 }}
                  >
                    {t("whole")}
                  </ToggleButton>
                  <ToggleButton
                    value="translation"
                    size="small"
                    color="primary"
                    selected={!!state.translated}
                    disabled={busy}
                    onClick={() => session.showTranslation(!state.translated)}
                    sx={{ flex: 1 }}
                  >
                    {t(state.translated ? "original" : "translation")}
                  </ToggleButton>
                </Stack>
              )}
              <Button
                size="small"
                variant="contained"
                disableElevation
                disabled={busy || !state.dirty}
                aria-label={t("save")}
                aria-busy={state.saving}
                title={state.dirty ? t("unsaved") : undefined}
                onClick={() => session.save()}
                sx={{ minHeight: 36, px: 2, flexShrink: 0 }}
              >
                {state.saving ? t("saving") : t("save")}
              </Button>
            </Stack>
            {state.error && (
              <Alert
                severity="error"
                sx={{ "& .MuiAlert-action": { alignItems: "center" } }}
                action={
                  <Button
                    size="small"
                    sx={{ whiteSpace: "nowrap" }}
                    disabled={busy}
                    onClick={() => session.requestAction("reload")}
                  >
                    {t("reload")}
                  </Button>
                }
              >
                {t(state.error)}
              </Alert>
            )}
            {!state.error && <Notice {...{ session, state, t }} />}
          </Stack>
        }
      >
        <Stack
          spacing={1}
          sx={{
            minHeight: 0,
            "& > :not(section)": { flexShrink: 0 },
          }}
        >
          <Autocomplete
            ref={patternField}
            freeSolo
            forcePopupIcon
            slotProps={{
              popper: {
                container: () =>
                  patternField.current?.closest(".notranslate") ||
                  document.body,
                sx: { zIndex: 2147483647 },
              },
            }}
            ListboxProps={{
              style: { overscrollBehavior: "contain", fontSize: 15 },
            }}
            disabled={busy}
            options={state.domainOptions || []}
            value={state.pattern || ""}
            inputValue={state.pattern || ""}
            onInputChange={(_, value, reason) => {
              if (reason === "input" || reason === "clear")
                session.setPattern(value);
            }}
            onChange={(_, value) => {
              session.setPattern(value || "");
              session.commitPattern();
            }}
            onBlur={() => session.commitPattern()}
            renderInput={(params) => (
              <TextField
                {...params}
                label={i18n("pattern")}
                size="small"
                error={!!state.patternError}
                helperText={
                  state.patternError ? t(state.patternError) : undefined
                }
                inputProps={{
                  ...params.inputProps,
                  spellCheck: false,
                  style: codeStyle,
                }}
              />
            )}
          />
          {state.loading && (
            <Typography role="status">{t("loading")}</Typography>
          )}
          {rule && (
            <>
              <EditorSelect
                label={i18n("auto_scan_page")}
                disabled={busy}
                value={rule.autoScan}
                onChange={(event) =>
                  session.updateDraft({ autoScan: event.target.value })
                }
              >
                <MenuItem value="false">{i18n("disable")}</MenuItem>
                <MenuItem value="true">{i18n("enable")}</MenuItem>
              </EditorSelect>
              {(rule.scanAll === "true" ||
                rule.isPlainText === true ||
                rule.isPlainText === "true") && (
                <Alert severity="warning">{t("scanAll")}</Alert>
              )}
              <Stack
                component="section"
                aria-label={t("currentGroup")}
                spacing={1}
                sx={{
                  minWidth: 0,
                  minHeight: 0,
                  flexShrink: 1,
                  "& > :not([aria-label])": { flexShrink: 0 },
                }}
              >
                <Divider textAlign="left">
                  <Typography variant="caption" color="text.secondary">
                    {t("currentGroup")}
                  </Typography>
                </Divider>
                <EditorSelect
                  label={t("purpose")}
                  value={state.field}
                  disabled={busy}
                  onChange={(event) => session.setField(event.target.value)}
                >
                  {SELECTOR_FIELDS.map((field) => (
                    <MenuItem key={field} value={field}>
                      {i18n(selectorLabels[field])}
                    </MenuItem>
                  ))}
                </EditorSelect>
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
                  <Alert severity="info" onClose={() => session.cancelPick()}>
                    {t("picking")}
                  </Alert>
                )}
                <Stack
                  spacing={1}
                  sx={{
                    maxHeight: 280,
                    minHeight: 80,
                    flexShrink: 1,
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                    scrollbarWidth: "thin",
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
                    onClick={() => session.updateDraft({ [state.field]: "" })}
                  >
                    {t("inherit")}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
                    title={t("inheritHelp")}
                    onClick={() =>
                      session.updateDraft({ [state.field]: EMPTY_SELECTOR })
                    }
                  >
                    {t("clear")}
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </Stack>
      </FloatingPanel>
      {inspectorVisible && (
        <FloatingPanel
          title={t(
            state.editing
              ? "editSelector"
              : state.selected
                ? "candidates"
                : "manualAdd"
          )}
          moveLabel={t("moveInspector")}
          position={inspectorPosition.position || adjacent}
          onMove={inspectorPosition.onMove}
          onMoveEnd={inspectorPosition.onMoveEnd}
          width={380}
          viewport={viewport}
          bodySx={state.selected ? undefined : { display: "none" }}
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
                autoFocus={!state.selected}
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
          {state.selected && (
            <Stack spacing={2}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="body2" color="text.secondary">
                  {i18n(selectorLabels[state.field])}
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
            </Stack>
          )}
        </FloatingPanel>
      )}
      <Dialog
        open={!!state.confirmAction}
        disablePortal
        container={() =>
          patternField.current?.closest(".notranslate") || document.body
        }
        disableEnforceFocus
        disableScrollLock
        onClose={() => !state.saving && session.emit({ confirmAction: "" })}
        aria-labelledby="rule-editor-unsaved-title"
        sx={{ zIndex: 2147483647 }}
      >
        <DialogTitle id="rule-editor-unsaved-title">
          {t("confirmTitle")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t("confirmHelp")}</DialogContentText>
          {(state.error || state.patternError) && (
            <Alert severity="error">
              {t(state.patternError || state.error)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button
            disabled={state.saving}
            onClick={() => session.emit({ confirmAction: "" })}
          >
            {t("continueEditing")}
          </Button>
          <Button
            disabled={state.saving}
            onClick={() => session.confirmAction(false)}
          >
            {t("discard")}
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => session.confirmAction(true)}
          >
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
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
