import { useState, useEffect, useCallback, useMemo } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import { useConfirm } from "../../hooks/Confirm";
import Box from "@mui/material/Box";
import { useSetting } from "../../hooks/Setting";
import { DEFAULT_TONES } from "../../config";

function genToneId() {
  return `tone-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function ToneFields({ tone, isBuiltin, onUpdate, onDelete }) {
  const i18n = useI18n();
  const [formData, setFormData] = useState({});
  const [isModified, setIsModified] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (tone) {
      setFormData(tone);
    }
  }, [tone]);

  useEffect(() => {
    if (!tone) return;
    const hasChanged = JSON.stringify(tone) !== JSON.stringify(formData);
    setIsModified(hasChanged);
  }, [tone, formData]);

  const handleChange = (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onUpdate(tone.id, formData);
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });
    if (isConfirmed) {
      onDelete(tone.id);
    }
  };

  const { name = "", description = "", instruction = "" } = formData;

  return (
    <Stack spacing={3}>
      <TextField
        size="small"
        label={i18n("tone_name")}
        name="name"
        value={name}
        onChange={handleChange}
      />
      <TextField
        size="small"
        label={i18n("tone_description")}
        name="description"
        value={description}
        onChange={handleChange}
      />
      <TextField
        size="small"
        label={i18n("tone_instruction")}
        name="instruction"
        value={instruction}
        onChange={handleChange}
        multiline
        minRows={3}
        maxRows={10}
        helperText={i18n("tone_instruction_helper")}
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
        >
          {i18n("save")}
        </Button>
        {!isBuiltin && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={handleDelete}
          >
            {i18n("delete")}
          </Button>
        )}
        {isBuiltin && (
          <Typography variant="caption" color="text.secondary">
            {i18n("builtin_tone")}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}

function ToneAccordion({ tone, isBuiltin, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const handleAccordionChange = () => {
    setExpanded((prev) => !prev);
  };

  return (
    <Accordion expanded={expanded} onChange={handleAccordionChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ width: "100%" }}
        >
          <Typography sx={{ flexGrow: 1, overflowWrap: "anywhere" }}>
            {tone.name}
            {tone.description && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ ml: 1 }}
              >
                - {tone.description}
              </Typography>
            )}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <ToneFields
            tone={tone}
            isBuiltin={isBuiltin}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function Tones() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const storedTones = setting.tones || [];

  // 合併 stored tones 與 DEFAULT_TONES
  // 處理：1) 移除已不存在的舊 builtin 2) 更新現有 builtin 內容 3) 新增缺少的 builtin
  const mergedTones = useMemo(() => {
    const defaultBuiltinIds = new Set(
      DEFAULT_TONES.filter((t) => t.isBuiltin).map((t) => t.id)
    );
    const storedIds = new Set(storedTones.map((t) => t.id));

    // 過濾掉已移除的舊 builtin，並更新現有 builtin 的內容
    const filteredTones = storedTones
      .filter((t) => !t.isBuiltin || defaultBuiltinIds.has(t.id))
      .map((t) => {
        if (!t.isBuiltin) return t;
        const defaultTone = DEFAULT_TONES.find((d) => d.id === t.id);
        return defaultTone || t;
      });

    // 新增缺少的 builtin
    const missingBuiltins = DEFAULT_TONES.filter(
      (t) => t.isBuiltin && !storedIds.has(t.id)
    );

    // 如果沒有任何變更，直接返回原陣列避免不必要的 re-render
    if (
      missingBuiltins.length === 0 &&
      filteredTones.length === storedTones.length
    ) {
      return storedTones;
    }

    return [...filteredTones, ...missingBuiltins];
  }, [storedTones]);

  useEffect(() => {
    if (mergedTones !== storedTones && mergedTones.length > 0) {
      updateSetting((prev) => ({ ...prev, tones: mergedTones }));
    }
  }, [mergedTones, storedTones, updateSetting]);

  const builtinTones = mergedTones.filter((t) => t.isBuiltin);
  const userTones = mergedTones.filter((t) => !t.isBuiltin);

  const handleAdd = useCallback(() => {
    const newTone = {
      id: genToneId(),
      name: i18n("new_tone"),
      description: "",
      instruction: "",
      isBuiltin: false,
    };
    updateSetting((prev) => ({
      ...prev,
      tones: [newTone, ...(prev.tones || DEFAULT_TONES)],
    }));
  }, [i18n, updateSetting]);

  const handleUpdate = useCallback(
    (id, updatedData) => {
      updateSetting((prev) => ({
        ...prev,
        tones: (prev.tones || DEFAULT_TONES).map((t) =>
          t.id === id ? { ...t, ...updatedData } : t
        ),
      }));
    },
    [updateSetting]
  );

  const handleDelete = useCallback(
    (id) => {
      updateSetting((prev) => ({
        ...prev,
        tones: (prev.tones || DEFAULT_TONES).filter((t) => t.id !== id),
      }));
    },
    [updateSetting]
  );

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">{i18n("tones_info")}</Alert>

        <Box>
          <Button
            size="small"
            variant="contained"
            onClick={handleAdd}
            startIcon={<AddIcon />}
          >
            {i18n("add")}
          </Button>
        </Box>

        {userTones.length > 0 && (
          <Box>
            {userTones.map((tone) => (
              <ToneAccordion
                key={tone.id}
                tone={tone}
                isBuiltin={false}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </Box>
        )}

        <Box>
          {builtinTones.map((tone) => (
            <ToneAccordion
              key={tone.id}
              tone={tone}
              isBuiltin={true}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
