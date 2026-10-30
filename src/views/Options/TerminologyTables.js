import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import LinkIcon from "@mui/icons-material/Link";
import SaveIcon from "@mui/icons-material/Save";
import SyncIcon from "@mui/icons-material/Sync";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import CopyBtn from "../Selection/CopyBtn";
import CodeField from "./CodeField";
import { useBlocker } from "react-router-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TextareaResizeGrip from "../../components/TextareaResizeGrip";
import useTextareaHeightLock, {
  useTextareaGripStyle,
  useReleaseOnGripHidden,
} from "../../hooks/useTextareaHeightLock";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useI18n } from "../../hooks/I18n";
import { useConfirm } from "../../hooks/Confirm";
import { useTerminologyDirectory } from "../../hooks/Terminology";
import {
  readTerminologyTable,
  saveTerminologyTable,
  deleteTerminologyTable,
} from "../../libs/terminologyStorage";
import {
  exportTableFile,
  parseTableFile,
  parseNormalSource,
} from "../../libs/terminology";
import { syncTerminology } from "../../libs/terminologySync";

const errorKeys = {
  "Invalid terminology table": "terminology_error_table",
  "Unsupported terminology format version": "terminology_error_version",
  "Invalid terminology dataset": "terminology_error_dataset",
  "Duplicate terminology table ID": "terminology_error_duplicate_id",
  "Configure cloud sync and encryption before syncing terminology":
    "terminology_error_sync_config",
  "Terminology changed during synchronization; sync again":
    "terminology_error_sync_changed",
  "HTTP/HTTPS URL required": "terminology_error_url",
  "Fix invalid ordinary terms before saving.": "terminology_invalid",
};
function TermDiagnostics({ diagnostics, i18n }) {
  return diagnostics.slice(0, 20).map((item, index) => (
    <Typography variant="body2" key={index} sx={{ overflowWrap: "anywhere" }}>
      {i18n(`terminology_diag_${item.type}`, i18n("terminology_diagnostic"))}
      {": "}
      {item.key || item.detail?.key || item.segment || ""}
    </Typography>
  ));
}

function TermTextField({ tableId, name, ...props }) {
  const i18n = useI18n();
  const inputRef = useRef(null);
  const gripStyle = useTextareaGripStyle();
  const heightLock = useTextareaHeightLock(
    `options-terminology:${tableId}:${name}`,
    inputRef
  );
  useReleaseOnGripHidden(gripStyle, heightLock.releaseHeight);
  const { releaseHeight } = heightLock;
  useLayoutEffect(() => {
    if (!props.value.trim()) releaseHeight();
  }, [props.value, releaseHeight]);
  return (
    <Box sx={{ position: "relative" }}>
      <CodeField
        {...props}
        className="kt-resizable-text-field"
        fullWidth
        size="small"
        minRows={3}
        maxRows={14}
        inputRef={inputRef}
        InputProps={{
          ...heightLock.rootProps,
          endAdornment:
            props.value.trim() || heightLock.lockedHeight != null ? (
              <TextareaResizeGrip
                target={heightLock.textareaRef}
                onResize={heightLock.applyHeight}
                value={heightLock.lockedHeight}
                label={i18n("field_resize_height")}
                variant={gripStyle}
                onRelease={heightLock.releaseHeight}
                unlockHint={i18n("field_resize_unlock_hint")}
              />
            ) : null,
        }}
        inputProps={{
          className: "kt-resizable-textarea",
          style: { resize: gripStyle === "hidden" ? "vertical" : "none" },
        }}
        sx={{ "& .MuiInputBase-root": { pr: 5, overflow: "visible" } }}
      />
      <Box sx={{ position: "absolute", top: 6, right: 10 }}>
        <CopyBtn
          text={props.value}
          title={`${i18n("copy")} ${props.label}`}
          copiedLabel={i18n("copy_success")}
        />
      </Box>
    </Box>
  );
}

const createTable = () => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  terms: "",
  aiTerms: "",
  normalMatchMode: "auto",
});
const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function TerminologyTables() {
  const i18n = useI18n();
  const confirm = useConfirm();
  const { tables, error: directoryError } = useTerminologyDirectory();
  const [table, setTable] = useState(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(null);
  const [importType, setImportType] = useState("terms");
  const [destination, setDestination] = useState("new");
  const [url, setUrl] = useState(null);
  const fileRef = useRef(null);
  const dirty = table && JSON.stringify(table) !== saved;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !!dirty && currentLocation.pathname !== nextLocation.pathname
  );
  const navigationPending = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || navigationPending.current) return;
    navigationPending.current = true;
    confirm({
      message: i18n("terminology_discard", "Discard unsaved changes?"),
    }).then((discard) => {
      navigationPending.current = false;
      if (discard) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm, i18n]);
  const parsed = useMemo(
    () =>
      parseNormalSource(table?.terms || "", table?.normalMatchMode || "auto"),
    [table?.terms, table?.normalMatchMode]
  );
  const preview = useMemo(
    () =>
      imported
        ? parseNormalSource(
            imported.table.terms,
            imported.table.normalMatchMode
          )
        : null,
    [imported]
  );
  const edit = (patch) => setTable((current) => ({ ...current, ...patch }));
  const canLeave = () =>
    !dirty ||
    confirm({
      message: i18n("terminology_discard", "Discard unsaved changes?"),
    });
  useEffect(() => {
    const beforeUnload = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const run = async (operation) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await operation();
    } catch (reason) {
      const key =
        errorKeys[reason.message] ||
        (reason.name === "SyntaxError" ? "terminology_error_json" : null);
      setError(
        key
          ? i18n(key)
          : `${i18n("terminology_error_operation")}: ${String(reason.message || reason)}`
      );
    } finally {
      setBusy(false);
    }
  };
  const select = (id) =>
    run(async () => {
      if (!(await canLeave())) return;
      const next = await readTerminologyTable(id);
      setTable(next);
      setSaved(JSON.stringify(next));
    });
  const startImport = (text, filename) => {
    const json =
      /\.json$/i.test(filename) ||
      (!/\.txt$/i.test(filename) && /^\s*[[{]/.test(text));
    const next = json
      ? parseTableFile(text, {
          ...createTable(),
          name: filename.replace(/\.[^.]+$/, ""),
        })
      : {
          ...createTable(),
          name: filename.replace(/\.[^.]+$/, ""),
          terms: text,
        };
    setImported({ table: next, json, text });
    setImportType("terms");
    setDestination("new");
  };
  const changeImported = (patch) =>
    setImported((current) => ({
      ...current,
      table: { ...current.table, ...patch },
    }));
  const saveImport = () =>
    run(async () => {
      let next = { ...imported.table };
      if (!imported.json) {
        next.terms = importType === "terms" ? imported.text : "";
        next.aiTerms = importType === "aiTerms" ? imported.text : "";
      }
      if (destination === "current") {
        if (!(await canLeave())) return;
        next = { ...table, [importType]: imported.text };
      } else if (destination === "copy") next.id = crypto.randomUUID();
      else if (tables.some((item) => item.id === next.id)) {
        if (
          !(await confirm({
            message: i18n(
              "terminology_replace",
              "Replace the existing table with this ID?"
            ),
          }))
        )
          return;
      }
      const check = parseNormalSource(next.terms, next.normalMatchMode);
      if (check.hasErrors)
        throw new Error("Fix invalid ordinary terms before saving.");
      const result = await saveTerminologyTable(next);
      setTable(result);
      setSaved(JSON.stringify(result));
      setImported(null);
    });
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        useFlexGap
        flexWrap="wrap"
      >
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          disabled={busy}
          onClick={async () => {
            if (await canLeave()) {
              setTable(createTable());
              setSaved("");
            }
          }}
        >
          {i18n("add", "New")}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileUploadIcon />}
          disabled={busy}
          onClick={() => fileRef.current.click()}
        >
          {i18n("terminology_import_file", "Import file")}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<LinkIcon />}
          disabled={busy}
          onClick={() => setUrl("")}
        >
          {i18n("terminology_import_url", "Import URL")}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<SyncIcon />}
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (!(await canLeave())) return;
              if (
                !(await confirm({
                  message: i18n(
                    "terminology_sync_help",
                    "Sync all saved tables. The newer dataset replaces the older dataset; tables are not merged individually."
                  ),
                }))
              )
                return;
              await syncTerminology();
              if (table) {
                const next = await readTerminologyTable(table.id);
                setTable(next);
                setSaved(JSON.stringify(next));
              }
              setStatus(i18n("terminology_synced", "Terminology synchronized"));
            })
          }
        >
          {i18n("terminology_sync", "Sync terminology")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt"
          hidden
          onChange={(event) => {
            const file = event.target.files[0];
            event.target.value = "";
            if (file)
              run(async () => {
                if (await canLeave()) startImport(await file.text(), file.name);
              });
          }}
        />
      </Stack>
      {(error || directoryError) && (
        <Alert severity="error">{error || directoryError}</Alert>
      )}
      {status && <Alert severity="success">{status}</Alert>}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          border: 1,
          borderColor: "divider",
          borderRadius: "16px",
          overflow: "hidden",
          "@container options-main (min-width: 760px)": {
            flexDirection: "row",
            alignItems: "flex-start",
          },
        }}
      >
        <Box
          sx={(theme) => ({
            width: "100%",
            flex: "0 0 auto",
            maxHeight: "min(40vh, 360px)",
            overflowY: "auto",
            borderBottom: `1px solid ${theme.palette.divider}`,
            "@container options-main (min-width: 760px)": {
              width: 280,
              flex: "0 0 280px",
              height: "calc(100vh - 280px)",
              minHeight: 420,
              maxHeight: "none",
              borderRight: `1px solid ${theme.palette.divider}`,
              borderBottom: 0,
            },
          })}
        >
          <List disablePadding sx={{ width: "100%", boxSizing: "border-box" }}>
            {tables.map((item) => (
              <ListItem
                key={item.id}
                disablePadding
                sx={{ px: 1, minHeight: 44 }}
              >
                <ListItemButton
                  selected={table?.id === item.id}
                  aria-pressed={table?.id === item.id}
                  disabled={busy}
                  onClick={() => select(item.id)}
                  sx={{
                    gap: 1,
                    minWidth: 0,
                    minHeight: 40,
                    py: 0.75,
                    px: 0.5,
                    borderRadius: "8px",
                  }}
                >
                  <TextSnippetIcon fontSize="small" color="action" />
                  <Typography
                    sx={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}
                  >
                    {item.name}
                  </Typography>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
        <Box
          sx={(theme) => ({
            flex: 1,
            minWidth: 0,
            p: 2,
            boxSizing: "border-box",
            "@container options-main (min-width: 760px)": {
              borderLeft: `1px solid ${theme.palette.divider}`,
              marginLeft: "-1px",
            },
          })}
        >
          {table ? (
            <Stack spacing={3}>
              <TextField
                size="small"
                label={i18n("terminology_name")}
                value={table.name}
                disabled={busy}
                onChange={(event) => edit({ name: event.target.value })}
              />
              <TextField
                size="small"
                label={i18n("terminology_description")}
                value={table.description}
                disabled={busy}
                onChange={(event) => edit({ description: event.target.value })}
              />
              <TextField
                size="small"
                select
                label={i18n("terminology_match_mode", "Ordinary term matching")}
                value={table.normalMatchMode}
                disabled={busy}
                onChange={(event) =>
                  edit({ normalMatchMode: event.target.value })
                }
              >
                {["auto", "substring", "regex"].map((mode) => (
                  <MenuItem key={mode} value={mode}>
                    {i18n(`terminology_mode_${mode}`, mode)}
                  </MenuItem>
                ))}
              </TextField>
              <TermTextField
                tableId={table.id}
                name="terms"
                label={i18n("terms")}
                helperText={i18n("terminology_text_help")}
                value={table.terms}
                disabled={busy}
                onChange={(event) => edit({ terms: event.target.value })}
              />
              <TermTextField
                tableId={table.id}
                name="aiTerms"
                label={i18n("ai_terms")}
                helperText={i18n("ai_terms_helper")}
                value={table.aiTerms}
                disabled={busy}
                onChange={(event) => edit({ aiTerms: event.target.value })}
              />
              {parsed.hasErrors && (
                <Alert severity="error">{i18n("terminology_invalid")}</Alert>
              )}
              <TermDiagnostics diagnostics={parsed.diagnostics} i18n={i18n} />
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                useFlexGap
                flexWrap="wrap"
              >
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={
                    busy || !table.name.trim() || parsed.hasErrors || !dirty
                  }
                  onClick={() =>
                    run(async () => {
                      const next = await saveTerminologyTable(table);
                      setTable(next);
                      setSaved(JSON.stringify(next));
                    })
                  }
                >
                  {i18n("save", "Save")}
                </Button>

                {["json", "terms", "aiTerms"].map((format) => (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    key={format}
                    disabled={busy || !table.name.trim()}
                    onClick={() =>
                      run(async () =>
                        download(
                          `${table.name.replace(/[<>:"/\\|?*]/g, "_")}${format === "json" ? ".json" : `.${format}.txt`}`,
                          format === "json"
                            ? exportTableFile(table)
                            : table[format],
                          format === "json" ? "application/json" : "text/plain"
                        )
                      )
                    }
                  >
                    {i18n("export", "Export")}{" "}
                    {format === "json"
                      ? "JSON"
                      : `${i18n(format === "terms" ? "terms" : "ai_terms")} TXT`}
                  </Button>
                ))}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DeleteIcon />}
                  color="error"
                  disabled={
                    busy || !tables.some((item) => item.id === table.id)
                  }
                  onClick={() =>
                    run(async () => {
                      if (
                        await confirm({
                          message: i18n(
                            "terminology_delete",
                            "Delete this table? References will remain until you remove them."
                          ),
                        })
                      ) {
                        await deleteTerminologyTable(table.id);
                        setTable(null);
                        setSaved("");
                      }
                    })
                  }
                >
                  {i18n("delete", "Delete")}
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Typography color="text.secondary">
              {i18n(
                "terminology_choose",
                "Select or create a terminology table."
              )}
            </Typography>
          )}
        </Box>
      </Box>
      <Dialog
        open={url !== null}
        onClose={() => !busy && setUrl(null)}
        fullWidth
      >
        <DialogTitle>
          {i18n("terminology_import_url", "Import URL")}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="URL"
            value={url || ""}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Typography variant="caption">
            {i18n(
              "terminology_url_help",
              "One-time import. The remote file will not be monitored or updated automatically."
            )}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setUrl(null)}>
            {i18n("cancel", "Cancel")}
          </Button>
          <Button
            disabled={busy || !url?.trim()}
            onClick={() =>
              run(async () => {
                if (!(await canLeave())) return;
                let address;
                try {
                  address = new URL(url.trim());
                } catch {
                  throw new Error("HTTP/HTTPS URL required");
                }
                if (!["http:", "https:"].includes(address.protocol))
                  throw new Error("HTTP/HTTPS URL required");
                const { fetchData } = await import("../../libs/fetch");
                const text = await fetchData(address.href, undefined, {
                  expect: "text",
                });
                startImport(
                  text,
                  decodeURIComponent(
                    address.pathname.split("/").pop() || "import"
                  )
                );
                setUrl(null);
              })
            }
          >
            {i18n("import", "Import")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!imported}
        onClose={() => !busy && setImported(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {i18n("terminology_import_preview", "Import preview")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {imported && (
              <>
                <TextField
                  label={i18n("terminology_name")}
                  required
                  value={imported.table.name}
                  onChange={(event) =>
                    changeImported({ name: event.target.value })
                  }
                />
                <TextField
                  label={i18n("terminology_description")}
                  value={imported.table.description}
                  onChange={(event) =>
                    changeImported({ description: event.target.value })
                  }
                />
                {!imported.json && (
                  <TextField
                    select
                    label={i18n("terminology_type", "Term type")}
                    value={importType}
                    onChange={(event) => {
                      setImportType(event.target.value);
                      changeImported({
                        terms:
                          event.target.value === "terms" ? imported.text : "",
                        aiTerms:
                          event.target.value === "aiTerms" ? imported.text : "",
                      });
                    }}
                  >
                    <MenuItem value="terms">{i18n("terms")}</MenuItem>
                    <MenuItem value="aiTerms">{i18n("ai_terms")}</MenuItem>
                  </TextField>
                )}
                <TextField
                  select
                  label={i18n(
                    "terminology_match_mode",
                    "Ordinary term matching"
                  )}
                  value={imported.table.normalMatchMode}
                  onChange={(event) =>
                    changeImported({ normalMatchMode: event.target.value })
                  }
                >
                  {["auto", "substring", "regex"].map((mode) => (
                    <MenuItem key={mode} value={mode}>
                      {i18n(`terminology_mode_${mode}`, mode)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label={i18n("terminology_destination", "Destination")}
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  <MenuItem value="new">
                    {i18n("terminology_keep_id", "Import (preserve JSON ID)")}
                  </MenuItem>
                  <MenuItem value="copy">
                    {i18n("terminology_new_id", "New table with new ID")}
                  </MenuItem>
                  {!imported.json && table && (
                    <MenuItem value="current">
                      {i18n(
                        "terminology_replace_body",
                        "Replace the selected text in the current table"
                      )}
                    </MenuItem>
                  )}
                </TextField>
                <Typography variant="caption">
                  {i18n("terminology_preview", "Parsed ordinary terms")}:{" "}
                  {preview?.terms.length}
                </Typography>
                <TextField
                  multiline
                  minRows={5}
                  maxRows={12}
                  value={
                    imported.json
                      ? `${imported.table.terms}\n\n${imported.table.aiTerms}`
                      : imported.text
                  }
                  InputProps={{ readOnly: true }}
                />
                {preview && (
                  <TermDiagnostics
                    diagnostics={preview.diagnostics}
                    i18n={i18n}
                  />
                )}
                {preview?.hasErrors && (
                  <Alert severity="error">
                    {i18n(
                      "terminology_invalid",
                      "Fix invalid ordinary terms before saving."
                    )}
                  </Alert>
                )}
                {error && <Alert severity="error">{error}</Alert>}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setImported(null)}>
            {i18n("cancel", "Cancel")}
          </Button>
          <Button
            disabled={
              busy || !imported?.table.name.trim() || preview?.hasErrors
            }
            onClick={saveImport}
          >
            {i18n("import", "Import")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
