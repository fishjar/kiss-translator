import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import HelpIcon from "@mui/icons-material/Help";

export default function HelpButton({ url }) {
  const i18n = useI18n();
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={() => {
        window.open(url, "_blank");
      }}
      startIcon={<HelpIcon />}
    >
      {i18n("help")}
    </Button>
  );
}
