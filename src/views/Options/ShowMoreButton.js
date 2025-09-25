import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";

export default function ShowMoreButton({ onChange, showMore }) {
  const i18n = useI18n();
  const handleClick = () => {
    onChange((prev) => !prev);
  };

  if (showMore) {
    return (
      <Button
        size="small"
        variant="text"
        onClick={handleClick}
        startIcon={<ExpandLessIcon />}
      >
        {i18n("less")}
      </Button>
    );
  }

  return (
    <Button
      size="small"
      variant="text"
      onClick={handleClick}
      startIcon={<ExpandMoreIcon />}
    >
      {i18n("more")}
    </Button>
  );
}
