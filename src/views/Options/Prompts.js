import {
  Fragment,
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
import CodeField from "./CodeField";

const TRANSLATION_PROMPT_PLACEHOLDERS = [
  INPUT_PLACE_TEXT,
  INPUT_PLACE_TO,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_TONE,
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

  if (
    category === PROMPT_CATEGORY_USER ||
    category === PROMPT_CATEGORY_BATCH_SYSTEM
  ) {
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
        onClick={onSelect}
        sx={{
          gap: 1,
          minWidth: 0,
          minHeight: 40,
          py: 0.75,
          px: 0.5,
          borderRadius: 0.5,
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
}) {
  const i18n = useI18n();
  const confirm = useConfirm();
  const [formData, setFormData] = useState(() => normalizePrompt(prompt));
  const promptDisplayName = getPromptDisplayName(prompt, i18n);
  const systemPromptRef = useRef(null);
  const userPromptRef = useRef(null);
  // 只有会读取 userPrompt 的链路展示第二段提示词，避免编辑无效字段。
  const showUserPrompt =
    formData.category === PROMPT_CATEGORY_USER ||
    formData.category === PROMPT_CATEGORY_DICTIONARY;

  useLayoutEffect(() => {
    setFormData(normalizePrompt(prompt));
  }, [prompt]);

  const isModified = useMemo(
    () =>
      !isPreset &&
      JSON.stringify(normalizePrompt(prompt)) !==
        JSON.stringify(normalizePrompt(formData)),
    [formData, isPreset, prompt]
  );

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
          size="small"
          label={i18n("system_prompt", "系统提示词")}
          name="systemPrompt"
          value={formData.systemPrompt}
          onChange={handleChange}
          inputRef={systemPromptRef}
          minRows={3}
          maxRows={14}
          disabled={isPreset}
          sx={{
            "& textarea": {
              resize: "vertical",
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
            size="small"
            label={i18n("user_prompt", "用户提示词")}
            name="userPrompt"
            value={formData.userPrompt}
            onChange={handleChange}
            inputRef={userPromptRef}
            minRows={3}
            maxRows={14}
            disabled={isPreset}
            sx={{
              "& textarea": {
                resize: "vertical",
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
  const {
    prompts,
    addPrompt,
    updatePrompt,
    deletePrompt,
    copyPrompt,
    isPresetPromptSlug,
  } = usePromptList();
  const [selectedPromptSlug, setSelectedPromptSlug] = useState("");
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

  const handleAddPromptFromTemplate = (template) => {
    const templateName = getPromptDisplayName(template, i18n);
    const promptSlug = addPrompt(template, templateName);
    setSelectedPromptSlug(promptSlug);
    handleClose();
  };

  const handleCopyPrompt = (prompt, promptDisplayName) => {
    const promptSlug = copyPrompt(prompt, promptDisplayName);
    setSelectedPromptSlug(promptSlug);
  };

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
                      onClick={() => handleAddPromptFromTemplate(template)}
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
          </Stack>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
            height: { md: "calc(100vh - 140px)" },
            minHeight: { md: 450 },
          }}
        >
          <Box
            sx={(theme) => ({
              width: { xs: "100%", md: 280 },
              flex: { xs: "0 0 auto", md: "0 0 280px" },
              height: { md: "100%" },
              overflowY: "auto",
              borderRight: {
                xs: 0,
                md: `1px solid ${theme.palette.divider}`,
              },
              borderBottom: {
                xs: `1px solid ${theme.palette.divider}`,
                md: 0,
              },
            })}
          >
            <List disablePadding>
              {prompts.map((prompt) => (
                <PromptListItem
                  key={normalizePrompt(prompt).slug}
                  prompt={prompt}
                  selected={normalizePrompt(prompt).slug === selectedPromptSlug}
                  isPreset={isPresetPromptSlug(normalizePrompt(prompt).slug)}
                  onSelect={() =>
                    setSelectedPromptSlug(normalizePrompt(prompt).slug)
                  }
                />
              ))}
            </List>
          </Box>

          <Box
            ref={detailPanelRef}
            sx={{
              flex: 1,
              minWidth: 0,
              p: 2,
              boxSizing: "border-box",
              height: { md: "100%" },
              overflowY: { md: "auto" },
              scrollbarGutter: { md: "stable" },
              overscrollBehavior: "contain",
            }}
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
                onCollapse={() => setSelectedPromptSlug("")}
              />
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
