import {
  Alert,
  Checkbox,
  Chip,
  FormControl,
  FormHelperText,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
} from "@mui/material";

export default function TerminologySelect({
  tables = [],
  value = [],
  onChange,
  disabled = false,
  sx,
  i18n,
  error = "",
  showChips = true,
  showHelperText = true,
  showAlert = true,
  size = "small",
  variant = "outlined",
}) {
  const names = new Map(tables.map((table) => [table.id, table.name]));
  const isCompact = !showChips && !showHelperText && !showAlert;
  return (
    <Stack
      spacing={isCompact ? 0 : 1}
      sx={{ minWidth: isCompact ? 0 : 200, ...sx }}
    >
      <FormControl fullWidth size={size} variant={variant} disabled={disabled}>
        <InputLabel>{i18n("terminology_tables", "术语表")}</InputLabel>
        <Select
          multiple
          size={size}
          label={i18n("terminology_tables", "术语表")}
          value={value}
          renderValue={(ids) =>
            ids
              .map(
                (id) =>
                  names.get(id) ||
                  `${i18n("terminology_missing", "本机未找到术语表")}: ${id}`
              )
              .join(" → ")
          }
          onChange={(event) => {
            const selected = event.target.value;
            onChange([
              ...value.filter((id) => selected.includes(id)),
              ...selected.filter((id) => !value.includes(id)),
            ]);
          }}
        >
          {[
            ...tables,
            ...value
              .filter((id) => !names.has(id))
              .map((id) => ({
                id,
                name: `${i18n("terminology_missing", "本机未找到术语表")}: ${id}`,
              })),
          ].map((table) => (
            <MenuItem key={table.id} value={table.id}>
              <Checkbox checked={value.includes(table.id)} />
              <ListItemText primary={table.name} />
            </MenuItem>
          ))}
        </Select>
        {showChips && value.length > 0 && (
          <Stack
            direction="row"
            spacing={0.5}
            useFlexGap
            flexWrap="wrap"
            sx={{ mt: 1 }}
          >
            {value.map((id) => (
              <Chip
                key={id}
                size="small"
                color={names.has(id) ? "default" : "warning"}
                label={names.get(id) || id}
                disabled={disabled}
                onDelete={() => onChange(value.filter((item) => item !== id))}
              />
            ))}
          </Stack>
        )}
        {showHelperText && (
          <FormHelperText>
            {i18n(
              "terminology_order",
              "靠前的表优先；取消后重新选择可调整顺序。"
            )}
          </FormHelperText>
        )}
      </FormControl>
      {showAlert && value.some((id) => !names.has(id)) && (
        <Alert severity="warning">
          {i18n(
            "terminology_missing_help",
            "本机未找到部分术语表。请同步、导入相同 ID 的表，或移除引用。"
          )}
        </Alert>
      )}
      {showAlert && error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
