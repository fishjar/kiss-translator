import { useRef, useState, useSyncExternalStore } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AdsClickRoundedIcon from "@mui/icons-material/AdsClickRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import M3Theme from "../../hooks/M3Theme";
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
import { getEditorPortalContainer } from "./portal";
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
  fontSize: 13,
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
    body1: { fontSize: 14 },
    body2: { fontSize: 13 },
    caption: { fontSize: 12 },
    button: { fontSize: 13 },
  },
};
const cardStyle = (selected) => ({
  border: "1px solid",
  borderColor: selected ? "primary.main" : "divider",
  bgcolor: selected ? "var(--kt-secc)" : "var(--kt-sf0)",
  color: selected ? "var(--kt-onsecc)" : "text.primary",
  borderRadius: "12px",
  overflow: "hidden",
});
const cardActionStyle = {
  minWidth: 0,
  p: 1.5,
  textAlign: "left",
  "&&.Mui-focusVisible": {
    outline: "none",
    boxShadow: "inset 0 0 0 3px var(--kt-pri)",
  },
};

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
        <Card
          key={candidate.selector}
          variant="outlined"
          sx={cardStyle(state.input === candidate.selector)}
        >
          <CardActionArea
            disabled={busy}
            aria-pressed={state.input === candidate.selector}
            onClick={() => {
              session.setInput(candidate.selector);
              session.refresh();
            }}
            sx={cardActionStyle}
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
                aria-live={
                  state.input === candidate.selector ? "polite" : "off"
                }
                label={
                  state.input === candidate.selector && state.matchIndex
                    ? `${state.matchIndex} / ${candidate.count}`
                    : candidate.count
                }
              />
            </Stack>
            <Typography
              component="code"
              sx={{ ...codeStyle, display: "block", mt: 0.5 }}
            >
              {candidate.selector}
            </Typography>
            {candidate.fragile && (
              <Typography variant="caption" color="warning.main">
                {t("fragile")}
              </Typography>
            )}
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}

function Notice({ session, state, t }) {
  if (!state.notice || state.notice === "saved") return null;
  return (
    <Alert severity="info" onClose={() => session.emit({ notice: "" })}>
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
  const [notificationHost, setNotificationHost] = useState(null);
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
  const compactFooter = mainWidth < 400;
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
        notificationContainer={notificationHost}
        notification={
          notificationHost && (
            <Snackbar
              open={
                state.notice === "saved" && !state.error && !state.confirmAction
              }
              autoHideDuration={5000}
              onClose={(_, reason) => {
                if (reason !== "clickaway") session.emit({ notice: "" });
              }}
              sx={{
                "&&": {
                  position: "static",
                  transform: "none",
                  width: "100%",
                  minWidth: 0,
                },
                pointerEvents: "auto",
              }}
            >
              <Alert
                severity="success"
                onClose={() => session.emit({ notice: "" })}
                sx={{
                  width: "100%",
                  minWidth: 0,
                  boxShadow: "var(--kt-shadow-2)",
                  overflowWrap: "anywhere",
                }}
              >
                {t("saved")}
              </Alert>
            </Snackbar>
          )
        }
        bodySx={{
          display: "flex",
          flexDirection: "column",
          p: viewport.h < 780 ? 1.5 : 2,
        }}
        actions={
          <Stack direction="row" sx={{ flexShrink: 0 }}>
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
            <Stack
              direction={compactFooter ? "column" : "row"}
              gap={1}
              alignItems="stretch"
            >
              {rule && (
                <Stack
                  component="section"
                  aria-label={t("pagePreview")}
                  direction="row"
                  spacing={1}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    p: 0.5,
                    borderRadius: "16px",
                    bgcolor: "var(--kt-sf2)",
                    "& .MuiToggleButton-root": {
                      flex: 1,
                      minWidth: 0,
                      minHeight: 40,
                      px: 1,
                      py: 0.5,
                      border: 0,
                      borderRadius: "12px",
                      fontSize: 13,
                      lineHeight: 1.4,
                      "&:first-of-type": { flex: 1.4 },
                      "&.Mui-disabled": { border: 0 },
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
                  >
                    {t(state.translated ? "original" : "translation")}
                  </ToggleButton>
                </Stack>
              )}
              <LoadingButton
                variant="contained"
                fullWidth={compactFooter || !rule}
                loading={state.saving}
                loadingPosition="start"
                loadingIndicator={
                  <CircularProgress
                    size={16}
                    color="inherit"
                    aria-label={t("saving")}
                  />
                }
                disabled={busy || !state.dirty}
                aria-label={t("save")}
                aria-busy={state.saving}
                title={state.dirty ? t("unsaved") : undefined}
                onClick={() => session.save()}
                startIcon={<SaveOutlinedIcon />}
                sx={{ flexShrink: 0, minHeight: 48 }}
              >
                {t("save")}
              </LoadingButton>
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
          spacing={1.5}
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
                container: () => getEditorPortalContainer(patternField.current),
                sx: {
                  zIndex: 2147483647,
                  "& .MuiAutocomplete-paper": {
                    mt: 0.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "12px",
                    bgcolor: "var(--kt-sf0)",
                    boxShadow: "var(--kt-shadow-2)",
                  },
                  "& .MuiAutocomplete-option": {
                    borderRadius: "8px",
                    "&.Mui-focused": { bgcolor: "var(--kt-sf3)" },
                    '&[aria-selected="true"]': {
                      bgcolor: "var(--kt-secc)",
                      color: "var(--kt-onsecc)",
                    },
                  },
                },
              },
            }}
            ListboxProps={{
              style: {
                overscrollBehavior: "contain",
                fontSize: 14,
                padding: 4,
              },
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
                variant="filled"
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
            <Stack
              direction="row"
              gap={1.5}
              alignItems="center"
              role="status"
              sx={{ p: 1 }}
            >
              <CircularProgress size={20} />
              <Typography variant="body2">{t("loading")}</Typography>
            </Stack>
          )}
          {rule && (
            <>
              <Stack
                component="label"
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                gap={2}
                sx={{
                  px: 1.5,
                  py: 1,
                  minHeight: 52,
                  borderRadius: "12px",
                  bgcolor: "var(--kt-sf2)",
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 650 }}>
                  {i18n("auto_scan_page")}
                </Typography>
                <Switch
                  disabled={busy}
                  checked={rule.autoScan === "true"}
                  inputProps={{ "aria-label": i18n("auto_scan_page") }}
                  onChange={(event) =>
                    session.updateDraft({
                      autoScan: String(event.target.checked),
                    })
                  }
                  sx={{ flexShrink: 0 }}
                />
              </Stack>
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
                  minWidth: 0,
                  minHeight: 0,
                  flexShrink: 1,
                  "& > :not([aria-label])": { flexShrink: 0 },
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ pt: 0.5 }}
                >
                  <Typography
                    variant="body2"
                    component="h2"
                    sx={{ fontWeight: 650 }}
                  >
                    {t("currentGroup")}
                  </Typography>
                  <Chip
                    size="small"
                    label={state.entries.length}
                    sx={{ bgcolor: "var(--kt-sf2)" }}
                  />
                </Stack>
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
                    color="secondary"
                    startIcon={<AdsClickRoundedIcon />}
                    disabled={busy}
                    onClick={() => session.pick()}
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {t("pick")}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    disabled={busy}
                    onClick={() => session.add()}
                    sx={{ flex: 1, minWidth: 0 }}
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
                    <Stack
                      alignItems="center"
                      spacing={1}
                      sx={{
                        p: 2.5,
                        border: "1px dashed",
                        borderColor: "divider",
                        borderRadius: "12px",
                        color: "text.secondary",
                      }}
                    >
                      <CodeRoundedIcon />
                      <Typography variant="body2">{t("empty")}</Typography>
                    </Stack>
                  )}
                  {state.entries.map((entry) => (
                    <Card
                      key={entry.selector}
                      variant="outlined"
                      onMouseEnter={() => session.hover(entry.selector)}
                      onMouseLeave={() => session.refresh()}
                      sx={{
                        ...cardStyle(state.editing === entry.selector),
                        display: "flex",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <CardActionArea
                        disabled={busy}
                        aria-label={entry.selector}
                        aria-pressed={state.editing === entry.selector}
                        onClick={() => session.edit(entry.selector)}
                        sx={{
                          ...cardActionStyle,
                          flex: 1,
                        }}
                      >
                        <Stack direction="row" alignItems="start" gap={1}>
                          <Typography
                            component="code"
                            sx={{
                              ...codeStyle,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {entry.selector}
                          </Typography>
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
                            mt: 0.75,
                          }}
                        >
                          {t(entry.source)}
                        </Typography>
                      </CardActionArea>
                      <IconButton
                        size="small"
                        title={t("delete")}
                        aria-label={`${t("delete")}: ${entry.selector}`}
                        disabled={busy}
                        onClick={() => session.remove(entry.selector)}
                        sx={{ m: 0.5, flexShrink: 0 }}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Card>
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
                variant="filled"
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
      <Box ref={setNotificationHost} />
      <Dialog
        open={!!state.confirmAction}
        disablePortal
        container={() => getEditorPortalContainer(patternField.current)}
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
        <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 3 }}>
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
      <M3Theme options={themeOptions}>
        <Editor {...props} />
      </M3Theme>
    </SettingProvider>
  );
}
