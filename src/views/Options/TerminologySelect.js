import { Stack, TextField } from "@mui/material";
import TerminologySelectView from "../../components/TerminologySelect";
import { useTerminologyDirectory } from "../../hooks/Terminology";
import { useI18n } from "../../hooks/I18n";

export default function TerminologySelect({
  tables: externalTables,
  i18n: externalI18n,
  ...props
}) {
  const contextI18n = useI18n();
  const { tables, error } = useTerminologyDirectory(!externalTables);
  return (
    <TerminologySelectView
      {...props}
      tables={externalTables || tables}
      i18n={externalI18n || contextI18n}
      error={error}
    />
  );
}

export function TerminologyFields({
  value = {},
  onChange,
  disabled = false,
  inline = true,
  tables,
}) {
  const i18n = useI18n();
  return (
    <Stack spacing={1.5}>
      <TerminologySelect
        tables={tables}
        value={value.termsList || []}
        onChange={(termsList) => onChange({ termsList })}
        disabled={disabled}
      />
      {inline && (
        <>
          <TextField
            size="small"
            multiline
            minRows={2}
            maxRows={8}
            disabled={disabled}
            label={i18n("terms")}
            helperText={i18n("terms_helper")}
            value={value.terms || ""}
            onChange={(event) => onChange({ terms: event.target.value })}
          />
          <TextField
            size="small"
            multiline
            minRows={2}
            maxRows={8}
            disabled={disabled}
            label={i18n("ai_terms")}
            helperText={i18n("ai_terms_helper")}
            value={value.aiTerms || ""}
            onChange={(event) => onChange({ aiTerms: event.target.value })}
          />
        </>
      )}
    </Stack>
  );
}
