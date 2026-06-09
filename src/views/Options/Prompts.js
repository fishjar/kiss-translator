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
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
  PROMPT_TEMPLATE_CATEGORIES,
  getPromptCategoryDisplayName,
  getPromptDisplayName,
  normalizePrompt,
} from "../../config";
import { usePromptList } from "../../hooks/Prompt";
import CodeField from "./CodeField";

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

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      message: i18n("delete_prompt_confirm", "确定删除这份提示词吗？"),
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      onDelete(formData.id);
      onCollapse?.();
    }
  };

  return (
    <Stack spacing={3}>
      <TextField
        size="small"
        label="ID"
        name="id"
        value={formData.id}
        InputProps={{ readOnly: true }}
      />

      <TextField
        size="small"
        label={i18n("prompt_name", "名称")}
        name="name"
        value={isPreset ? promptDisplayName : formData.name}
        onChange={handleChange}
        disabled={isPreset}
      />

      <CodeField
        size="small"
        label={i18n("system_prompt", "系统提示词")}
        name="systemPrompt"
        value={formData.systemPrompt}
        onChange={handleChange}
        maxRows={14}
        disabled={isPreset}
      />

      <CodeField
        size="small"
        label={i18n("user_prompt", "用户提示词")}
        name="userPrompt"
        value={formData.userPrompt}
        onChange={handleChange}
        maxRows={14}
        disabled={isPreset}
      />

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
    isPresetPromptId,
  } = usePromptList();
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [anchorEl, setAnchorEl] = useState(null);
  const detailPanelRef = useRef(null);
  const addMenuOpen = Boolean(anchorEl);

  useEffect(() => {
    if (prompts.length === 0) {
      setSelectedPromptId("");
      return;
    }

    const selectedExists = prompts.some(
      (prompt) => prompt.id === selectedPromptId
    );
    if (!selectedExists) {
      setSelectedPromptId(prompts[0].id);
    }
  }, [prompts, selectedPromptId]);

  useLayoutEffect(() => {
    detailPanelRef.current?.scrollTo({ top: 0 });
  }, [selectedPromptId]);

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId),
    [prompts, selectedPromptId]
  );

  const promptTemplateGroups = useMemo(
    () =>
      PROMPT_TEMPLATE_CATEGORIES.map((category) => ({
        category,
        templates: prompts.filter(
          (prompt) =>
            isPresetPromptId(prompt.id) &&
            normalizePrompt(prompt).category === category
        ),
      })).filter((group) => group.templates.length > 0),
    [isPresetPromptId, prompts]
  );

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleAddPromptFromTemplate = (template) => {
    const templateName = getPromptDisplayName(template, i18n);
    const promptId = addPrompt(template, templateName);
    setSelectedPromptId(promptId);
    handleClose();
  };

  const handleCopyPrompt = (prompt, promptDisplayName) => {
    const promptId = copyPrompt(prompt, promptDisplayName);
    setSelectedPromptId(promptId);
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">
          {i18n(
            "prompt_management_help",
            "集中管理翻译、AI 断句和未来 AI 词典会使用的提示词。预设只能复制为模板，自定义提示词可以修改和删除。"
          )}
        </Alert>

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
            <Chip
              size="small"
              icon={<LockIcon />}
              label={i18n("preset_prompt", "预设提示词")}
            />
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
                      key={template.id}
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
          }}
        >
          <Box
            sx={(theme) => ({
              width: { xs: "100%", md: 280 },
              flex: { xs: "0 0 auto", md: "0 0 280px" },
              maxHeight: { xs: 240, md: "calc(100vh - 230px)" },
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
                  key={prompt.id}
                  prompt={prompt}
                  selected={prompt.id === selectedPromptId}
                  isPreset={isPresetPromptId(prompt.id)}
                  onSelect={() => setSelectedPromptId(prompt.id)}
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
              height: { md: "calc(100vh - 230px)" },
              overflowY: { md: "auto" },
              scrollbarGutter: { md: "stable" },
              overscrollBehavior: "contain",
            }}
          >
            {selectedPrompt && (
              <PromptFields
                prompt={selectedPrompt}
                isPreset={isPresetPromptId(selectedPrompt.id)}
                onSave={(updateData) =>
                  updatePrompt(selectedPrompt.id, updateData)
                }
                onCopy={handleCopyPrompt}
                onDelete={deletePrompt}
                onCollapse={() => setSelectedPromptId("")}
              />
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
