import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import LockIcon from "@mui/icons-material/Lock";
import SaveIcon from "@mui/icons-material/Save";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useConfirm } from "../../hooks/Confirm";
import { useI18n } from "../../hooks/I18n";
import {
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_CONTEXT,
  INPUT_PLACE_FROM,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_GLOSSARY,
  INPUT_PLACE_SEGMENTS,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_TEXT,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_TO,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_TONE,
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_CATEGORY_SUBTITLE,
  PROMPT_CATEGORY_USER,
  PROMPT_TEMPLATE_CATEGORIES,
  getPromptCategoryDisplayName,
  getPromptDisplayName,
  normalizePrompt,
} from "../../config";
import { usePromptList } from "../../hooks/Prompt";
import { useSettingsSearchNavigation } from "./SettingsSearchTarget";
import CodeField from "./CodeField";
import TextareaResizeGrip from "../../components/TextareaResizeGrip";
import useTextareaHeightLock, {
  useTextareaGripStyle,
  useReleaseOnGripHidden,
} from "../../hooks/useTextareaHeightLock";

const TRANSLATION_PROMPT_PLACEHOLDERS = [
  INPUT_PLACE_TEXT,
  INPUT_PLACE_TO,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_CONTEXT,
  INPUT_PLACE_TONE,
  INPUT_PLACE_GLOSSARY,
];

const hasUserPromptField = ({ category }) =>
  category === PROMPT_CATEGORY_USER ||
  category === PROMPT_CATEGORY_DICTIONARY ||
  category === PROMPT_CATEGORY_BATCH_SYSTEM;

const BATCH_TRANSLATION_PROMPT_PLACEHOLDERS = [
  INPUT_PLACE_SEGMENTS,
  INPUT_PLACE_TO,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_CONTEXT,
  INPUT_PLACE_TONE,
  INPUT_PLACE_GLOSSARY,
];

const SUBTITLE_PROMPT_PLACEHOLDERS = [
  INPUT_PLACE_TO,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_TONE,
  INPUT_PLACE_GLOSSARY,
];

const DICTIONARY_PROMPT_PLACEHOLDERS = [
  INPUT_PLACE_TEXT,
  INPUT_PLACE_TO,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_CONTEXT,
];

function getPromptPlaceholders(category) {
  if (category === PROMPT_CATEGORY_SUBTITLE) {
    return SUBTITLE_PROMPT_PLACEHOLDERS;
  }

  if (category === PROMPT_CATEGORY_DICTIONARY) {
    return DICTIONARY_PROMPT_PLACEHOLDERS;
  }

  if (category === PROMPT_CATEGORY_BATCH_SYSTEM) {
    return BATCH_TRANSLATION_PROMPT_PLACEHOLDERS;
  }

  if (category === PROMPT_CATEGORY_USER) {
    return TRANSLATION_PROMPT_PLACEHOLDERS;
  }

  return [];
}

function PromptPlaceholderButtons({ category, disabled, onInsert }) {
  const placeholders = getPromptPlaceholders(category);

  if (placeholders.length === 0) {
    return null;
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {placeholders.map((placeholder) => (
          <Button
            key={placeholder}
            size="small"
            variant="text"
            disabled={disabled}
            onClick={() => onInsert(placeholder)}
            sx={{ textTransform: "none" }}
          >
            {placeholder}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}

function PromptListItem({ prompt, selected, isPreset, onSelect }) {
  const i18n = useI18n();

  return (
    <ListItem
      disablePadding
      sx={{
        px: 1,
        minHeight: 44,
      }}
    >
      <ListItemButton
        selected={selected}
        aria-pressed={selected}
        onClick={onSelect}
        sx={{
          gap: 1,
          minWidth: 0,
          minHeight: 40,
          py: 0.75,
          px: 0.5,
          borderRadius: "8px",
        }}
      >
        {isPreset ? (
          <LockIcon fontSize="small" color="action" />
        ) : (
          <TextSnippetIcon fontSize="small" color="action" />
        )}
        <Typography
          sx={{
            minWidth: 0,
            flex: 1,
            overflowWrap: "anywhere",
          }}
        >
          {getPromptDisplayName(prompt, i18n)}
        </Typography>
      </ListItemButton>
    </ListItem>
  );
}

function PromptFields({
  prompt,
  isPreset,
  onSave,
  onCopy,
  onDelete,
  onCollapse,
  onDirtyChange,
}) {
  const i18n = useI18n();
  const confirm = useConfirm();
  const [formData, setFormData] = useState(() => normalizePrompt(prompt));
  const lastSyncedPromptRef = useRef(JSON.stringify(normalizePrompt(prompt)));
  const promptDisplayName = getPromptDisplayName(prompt, i18n);
  const systemPromptRef = useRef(null);
  const userPromptRef = useRef(null);
  const gripStyle = useTextareaGripStyle();
  // 键随提示词 slug 走：不同提示词互不串用会话高度记忆；normalizePrompt
  // 保证 slug 为字符串，空串与缺省一律回落 draft。
  const systemHeightLock = useTextareaHeightLock(
    `options-prompt-system:${formData.slug || "draft"}`,
    systemPromptRef
  );
  const userHeightLock = useTextareaHeightLock(
    `options-prompt-user:${formData.slug || "draft"}`,
    userPromptRef
  );
  useReleaseOnGripHidden(gripStyle, systemHeightLock.releaseHeight);
  useReleaseOnGripHidden(gripStyle, userHeightLock.releaseHeight);

  // 内容清空 → 彻底解锁：清除会话高度记忆并还原 root，手柄随内容门控
  // 消失；门控表达式的锁定分支保留（服务于「有内容且已锁」的存续态）。
  // useLayoutEffect：空内容解锁须先于绘制，防重挂载首帧以记忆高度闪现。
  // releaseHeight 为 useCallback([lockKey]) 产物（lockKey 不变则引用恒
  // 定），经解构取稳定引用后进依赖数组——消除对 hook 返回对象整体的
  // exhaustive-deps 告警形态（发布面：CRA 下 warning 即构建失败）。
  const { releaseHeight: releaseSystemHeight } = systemHeightLock;
  const { releaseHeight: releaseUserHeight } = userHeightLock;
  useLayoutEffect(() => {
    if (!(formData.systemPrompt || "").trim()) {
      releaseSystemHeight();
    }
  }, [formData.systemPrompt, releaseSystemHeight]);
  useLayoutEffect(() => {
    if (!(formData.userPrompt || "").trim()) {
      releaseUserHeight();
    }
  }, [formData.userPrompt, releaseUserHeight]);
  // Only show the second prompt for flows that consume userPrompt.
  const showUserPrompt = hasUserPromptField(formData);

  // Rebuilding the prompt list can replace objects without changing their content.
  // Reset the unsaved draft only when the persisted content changes.
  useLayoutEffect(() => {
    const nextSnapshot = JSON.stringify(normalizePrompt(prompt));
    if (lastSyncedPromptRef.current === nextSnapshot) {
      return;
    }
    lastSyncedPromptRef.current = nextSnapshot;
    setFormData(normalizePrompt(prompt));
  }, [prompt]);

  const isModified = useMemo(
    () =>
      !isPreset &&
      JSON.stringify(normalizePrompt(prompt)) !==
        JSON.stringify(normalizePrompt(formData)),
    [formData, isPreset, prompt]
  );

  useEffect(() => {
    onDirtyChange?.(isModified);
  }, [isModified, onDirtyChange]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  const handleInsertPlaceholder = (name, inputRef, placeholder) => {
    if (isPreset) {
      return;
    }

    const input = inputRef.current;
    const value = formData[name] || "";
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const nextValue =
      value.slice(0, start) + placeholder + value.slice(end, value.length);

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));

    setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(
        start + placeholder.length,
        start + placeholder.length
      );
    });
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      message: i18n("delete_prompt_confirm", "确定删除这份提示词吗？"),
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      onDelete(formData.slug);
      onCollapse?.();
    }
  };

  return (
    <Stack spacing={3}>
      <TextField
        size="small"
        label={i18n("prompt_name", "名称")}
        name="name"
        value={isPreset ? promptDisplayName : formData.name}
        onChange={handleChange}
        disabled={isPreset}
      />

      <Stack spacing={1}>
        <CodeField
          className="kt-resizable-text-field"
          size="small"
          label={i18n("system_prompt", "系统提示词")}
          name="systemPrompt"
          value={formData.systemPrompt}
          onChange={handleChange}
          inputRef={systemPromptRef}
          minRows={3}
          maxRows={14}
          disabled={isPreset}
          InputProps={{
            ...systemHeightLock.rootProps,
            endAdornment:
              formData.systemPrompt.trim() ||
              systemHeightLock.lockedHeight != null ? (
                <TextareaResizeGrip
                  target={systemHeightLock.textareaRef}
                  onResize={systemHeightLock.applyHeight}
                  value={systemHeightLock.lockedHeight}
                  label={i18n("field_resize_height")}
                  variant={gripStyle}
                  onRelease={systemHeightLock.releaseHeight}
                  unlockHint={i18n("field_resize_unlock_hint")}
                />
              ) : null,
          }}
          inputProps={{
            className: "kt-resizable-textarea",
              style: { resize: gripStyle === "hidden" ? "vertical" : "none" },
          }}
          sx={{
            "& .MuiInputBase-root": {
              overflow: "visible",
            },
          }}
        />
        {!isPreset && (
          <PromptPlaceholderButtons
            category={formData.category}
            onInsert={(placeholder) =>
              handleInsertPlaceholder(
                "systemPrompt",
                systemPromptRef,
                placeholder
              )
            }
          />
        )}
      </Stack>

      {showUserPrompt && (
        <Stack spacing={1}>
          <CodeField
            className="kt-resizable-text-field"
            size="small"
            label={i18n("user_prompt", "用户提示词")}
            name="userPrompt"
            value={formData.userPrompt}
            onChange={handleChange}
            inputRef={userPromptRef}
            minRows={3}
            maxRows={14}
            disabled={isPreset}
            InputProps={{
              ...userHeightLock.rootProps,
              endAdornment:
                formData.userPrompt.trim() ||
                userHeightLock.lockedHeight != null ? (
                  <TextareaResizeGrip
                    target={userHeightLock.textareaRef}
                    onResize={userHeightLock.applyHeight}
                    value={userHeightLock.lockedHeight}
                    label={i18n("field_resize_height")}
                    variant={gripStyle}
                    onRelease={userHeightLock.releaseHeight}
                    unlockHint={i18n("field_resize_unlock_hint")}
                  />
                ) : null,
            }}
            inputProps={{
              className: "kt-resizable-textarea",
              style: { resize: gripStyle === "hidden" ? "vertical" : "none" },
            }}
            sx={{
              "& .MuiInputBase-root": {
                overflow: "visible",
              },
            }}
          />
          {!isPreset && (
            <PromptPlaceholderButtons
              category={formData.category}
              onInsert={(placeholder) =>
                handleInsertPlaceholder(
                  "userPrompt",
                  userPromptRef,
                  placeholder
                )
              }
            />
          )}
        </Stack>
      )}

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
          onClick={handleSave}
          disabled={!isModified}
          startIcon={<SaveIcon />}
        >
          {i18n("save")}
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onCopy(formData, promptDisplayName)}
          startIcon={<ContentCopyIcon />}
        >
          {i18n("copy_as_template", "复制为模板")}
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={handleDelete}
          disabled={isPreset}
          startIcon={<DeleteIcon />}
        >
          {i18n("delete")}
        </Button>
      </Stack>
    </Stack>
  );
}

export default function Prompts() {
  const i18n = useI18n();
  const confirm = useConfirm();
  const {
    prompts,
    addPrompt,
    updatePrompt,
    deletePrompt,
    copyPrompt,
    isPresetPromptSlug,
  } = usePromptList();
  const [selectedPromptSlug, setSelectedPromptSlug] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const detailPanelRef = useRef(null);
  const addMenuOpen = Boolean(anchorEl);

  useEffect(() => {
    if (prompts.length === 0) {
      setSelectedPromptSlug("");
      return;
    }

    const selectedExists = prompts.some(
      (prompt) => normalizePrompt(prompt).slug === selectedPromptSlug
    );
    if (!selectedExists) {
      setSelectedPromptSlug(normalizePrompt(prompts[0]).slug);
    }
  }, [prompts, selectedPromptSlug]);

  useLayoutEffect(() => {
    detailPanelRef.current?.scrollTo({ top: 0 });
  }, [selectedPromptSlug]);

  const selectedPrompt = useMemo(
    () =>
      prompts.find(
        (prompt) => normalizePrompt(prompt).slug === selectedPromptSlug
      ),
    [prompts, selectedPromptSlug]
  );

  const promptTemplateGroups = useMemo(
    () =>
      PROMPT_TEMPLATE_CATEGORIES.map((category) => ({
        category,
        templates: prompts.filter(
          (prompt) =>
            isPresetPromptSlug(normalizePrompt(prompt).slug) &&
            normalizePrompt(prompt).category === category
        ),
      })).filter((group) => group.templates.length > 0),
    [isPresetPromptSlug, prompts]
  );

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const confirmDiscardChanges = useCallback(async () => {
    if (!editorDirty) return true;
    return confirm({
      message: i18n("discard_prompt_changes_confirm"),
      confirmText: i18n("discard_changes"),
      cancelText: i18n("cancel"),
    });
  }, [confirm, editorDirty, i18n]);

  const handleAddPromptFromTemplate = async (template) => {
    if (!(await confirmDiscardChanges())) return;
    const templateName = getPromptDisplayName(template, i18n);
    const promptSlug = addPrompt(template, templateName);
    setEditorDirty(false);
    setSelectedPromptSlug(promptSlug);
    handleClose();
  };

  const handleCopyPrompt = (prompt, promptDisplayName) => {
    const promptSlug = copyPrompt(prompt, promptDisplayName);
    setEditorDirty(false);
    setSelectedPromptSlug(promptSlug);
  };

  const handleSelectPrompt = useCallback(
    async (prompt) => {
      const promptSlug = normalizePrompt(prompt).slug;
      if (promptSlug === selectedPromptSlug) return;
      if (!(await confirmDiscardChanges())) return;
      setEditorDirty(false);
      setSelectedPromptSlug(promptSlug);
    },
    [selectedPromptSlug, confirmDiscardChanges]
  );

  const { target: searchTarget, navigationKey } = useSettingsSearchNavigation();
  const handledSearchTarget = useRef(null);
  useEffect(() => {
    if (searchTarget !== "user_prompt") {
      handledSearchTarget.current = null;
      return;
    }
    if (
      !selectedPrompt ||
      (handledSearchTarget.current?.target === searchTarget &&
        handledSearchTarget.current?.navigationKey === navigationKey)
    )
      return;
    handledSearchTarget.current = { target: searchTarget, navigationKey };
    if (hasUserPromptField(selectedPrompt)) return;
    const match = prompts.find(hasUserPromptField);
    if (match) void handleSelectPrompt(match);
  }, [
    searchTarget,
    navigationKey,
    selectedPrompt,
    prompts,
    handleSelectPrompt,
  ]);

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            useFlexGap
            flexWrap="wrap"
          >
            <Button
              size="small"
              id="add-prompt-button"
              variant="contained"
              onClick={handleClick}
              aria-controls={addMenuOpen ? "add-prompt-menu" : undefined}
              aria-haspopup="true"
              aria-expanded={addMenuOpen ? "true" : undefined}
              startIcon={<AddIcon />}
              endIcon={<KeyboardArrowDownIcon />}
            >
              {i18n("add_prompt", "新增提示词")}
            </Button>
          </Stack>
        </Box>

        <Box
          className="kt-prompt-editor kt-prompt-editor--container-responsive"
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
            className="kt-prompt-editor__list-panel"
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
            <List
              className="kt-prompt-editor__list"
              disablePadding
              sx={{ width: "100%", boxSizing: "border-box" }}
            >
              {prompts.map((prompt) => (
                <PromptListItem
                  key={normalizePrompt(prompt).slug}
                  prompt={prompt}
                  selected={normalizePrompt(prompt).slug === selectedPromptSlug}
                  isPreset={isPresetPromptSlug(normalizePrompt(prompt).slug)}
                  onSelect={() => void handleSelectPrompt(prompt)}
                />
              ))}
            </List>
          </Box>

          <Box
            className="kt-prompt-editor__detail-panel"
            ref={detailPanelRef}
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
            {selectedPrompt && (
              <PromptFields
                prompt={selectedPrompt}
                isPreset={isPresetPromptSlug(
                  normalizePrompt(selectedPrompt).slug
                )}
                onSave={(updateData) =>
                  updatePrompt(normalizePrompt(selectedPrompt).slug, updateData)
                }
                onCopy={handleCopyPrompt}
                onDelete={deletePrompt}
                onDirtyChange={setEditorDirty}
                onCollapse={() => {
                  setEditorDirty(false);
                  setSelectedPromptSlug("");
                }}
              />
            )}
          </Box>
        </Box>
      </Stack>

      <Menu
        id="add-prompt-menu"
        anchorEl={anchorEl}
        open={addMenuOpen}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "add-prompt-button",
        }}
      >
        {promptTemplateGroups.map((group) => (
          <Fragment key={group.category}>
            <ListSubheader disableSticky>
              {getPromptCategoryDisplayName(group.category, i18n)}
            </ListSubheader>
            {group.templates.map((template) => (
              <MenuItem
                key={normalizePrompt(template).slug}
                onClick={() => void handleAddPromptFromTemplate(template)}
                sx={{ gap: 1 }}
              >
                <LockIcon fontSize="small" color="action" />
                <Box component="span" sx={{ flex: 1 }}>
                  {getPromptDisplayName(template, i18n)}
                </Box>
              </MenuItem>
            ))}
          </Fragment>
        ))}
      </Menu>
    </Box>
  );
}
