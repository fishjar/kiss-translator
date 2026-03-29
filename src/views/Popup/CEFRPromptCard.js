import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { normalizeCEFRSetting } from "../../config";
import { useI18n } from "../../hooks/I18n";
import { getCEFRLabel } from "../Options/cefrQuiz";

export default function CEFRPromptCard({ cefrSetting, onOpenCEFR }) {
  const i18n = useI18n();
  const normalizedCEFR = normalizeCEFRSetting(cefrSetting);
  const currentLevelLabel = getCEFRLabel(normalizedCEFR.level);

  const handleOpen = () => {
    if (typeof onOpenCEFR === "function") {
      onOpenCEFR();
    }
  };

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: 1 }}>
        {normalizedCEFR.assessmentCompleted ? (
          <>
            <Typography variant="subtitle1" fontWeight={600}>
              {i18n("cefr_prompt_configured_title", "CEFR level ready")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {`${i18n("cefr_current_level", "Current level")}: ${currentLevelLabel}`}
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="subtitle1" fontWeight={600}>
              {i18n("cefr_prompt_incomplete_title", "Quick CEFR setup")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "cefr_prompt_incomplete_desc",
                "Finish a short quiz to personalize words."
              )}
            </Typography>
          </>
        )}
      </CardContent>
      <CardActions>
        <Button variant="text" onClick={handleOpen}>
          {normalizedCEFR.assessmentCompleted
            ? i18n("cefr_prompt_configured_cta", "Retake or adjust")
            : i18n("cefr_prompt_incomplete_cta", "Take quick quiz")}
        </Button>
      </CardActions>
    </Card>
  );
}
