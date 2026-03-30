import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import { normalizeCEFRSetting } from "../../config";
import { useI18n } from "../../hooks/I18n";
import { useSetting } from "../../hooks/Setting";
import {
  CEFR_LEVEL_OPTIONS,
  calculateQuizLevel,
  getLocalizedQuizQuestion,
  getCEFRLabel,
  CEFR_QUIZ_QUESTIONS,
} from "./cefrQuiz";

function QuizView({ i18n, questionIndex, onSelectChoice }) {
  const question = getLocalizedQuizQuestion(questionIndex, i18n);
  if (!question) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2" color="text.secondary">
          {`${i18n("cefr_quiz_progress", "Question")} ${questionIndex + 1}/${
            CEFR_QUIZ_QUESTIONS.length
          }`}
        </Typography>
        <Typography variant="h6">{question.prompt}</Typography>
        <Stack spacing={1}>
          {question.choices.map((choice) => (
            <Button
              key={`${question.id}-${choice.labelKey}`}
              variant="outlined"
              onClick={() => onSelectChoice(choice.isCorrect)}
            >
              {choice.label}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function CEFRSetting() {
  const i18n = useI18n();
  const { setting, updateSetting } = useSetting();
  const cefrSetting = normalizeCEFRSetting(setting?.cefrSetting);
  const [quizVisible, setQuizVisible] = useState(false);
  const [answers, setAnswers] = useState([]);

  const currentLevelLabel = useMemo(
    () => getCEFRLabel(cefrSetting.level, i18n),
    [cefrSetting.level, i18n]
  );

  const updateCEFRSetting = (patch) => {
    updateSetting({
      cefrSetting: {
        ...cefrSetting,
        ...patch,
      },
    });
  };

  const persistCEFRLevel = (level, levelSource) => {
    updateCEFRSetting({
      level,
      assessmentCompleted: true,
      levelSource,
      enabled:
        cefrSetting.assessmentCompleted === true ? cefrSetting.enabled : true,
    });
  };

  const toggleCEFRPersonalization = () => {
    updateCEFRSetting({
      enabled: !cefrSetting.enabled,
    });
  };

  const startQuiz = () => {
    setAnswers([]);
    setQuizVisible(true);
  };

  const handleSelectChoice = (isCorrect) => {
    const nextAnswers = [...answers, Boolean(isCorrect)];

    if (!isCorrect || nextAnswers.length >= CEFR_QUIZ_QUESTIONS.length) {
      const resultLevel = calculateQuizLevel(nextAnswers);
      persistCEFRLevel(resultLevel, "quiz");
      setQuizVisible(false);
      setAnswers([]);
      return;
    }

    setAnswers(nextAnswers);
  };

  const isConfiguredAndPaused =
    cefrSetting.assessmentCompleted && !cefrSetting.enabled;
  const configuredTitle = isConfiguredAndPaused
    ? i18n("cefr_configured_disabled_title", "CEFR is configured but paused")
    : i18n("cefr_configured_title", "CEFR is configured");
  const statusLabel = isConfiguredAndPaused
    ? i18n("cefr_status_paused", "Paused")
    : i18n("cefr_status_active", "Active");

  return (
    <Box>
      <Stack spacing={2}>
        <Typography variant="h5">
          {i18n("cefr_setting_title", "CEFR onboarding")}
        </Typography>

        {!cefrSetting.assessmentCompleted && !quizVisible && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="h6">
                {i18n("cefr_onboarding_title", "Quick CEFR check")}
              </Typography>
              <Typography color="text.secondary">
                {i18n(
                  "cefr_onboarding_desc",
                  "Take a short quiz to set your level."
                )}
              </Typography>
              <Button variant="contained" onClick={startQuiz}>
                {i18n("cefr_start_quiz", "Start quick quiz")}
              </Button>
            </Stack>
          </Paper>
        )}

        {quizVisible && (
          <QuizView
            i18n={i18n}
            questionIndex={answers.length}
            onSelectChoice={handleSelectChoice}
          />
        )}

        {cefrSetting.assessmentCompleted && !quizVisible && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                useFlexGap
                flexWrap="wrap"
                gap={1}
              >
                <Typography variant="h6">{configuredTitle}</Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip
                    label={statusLabel}
                    color={isConfiguredAndPaused ? "default" : "success"}
                    variant="outlined"
                  />
                  <Chip
                    label={`${i18n("cefr_current_level", "Current level")}: ${currentLevelLabel}`}
                    color="primary"
                    variant="outlined"
                  />
                </Stack>
              </Stack>

              {isConfiguredAndPaused && (
                <Typography color="text.secondary">
                  {i18n(
                    "cefr_configured_disabled_desc",
                    "Your level is saved, but CEFR personalization is currently paused."
                  )}
                </Typography>
              )}

              <Typography>
                {`${i18n("cefr_current_level", "Current level")}: ${currentLevelLabel}`}
              </Typography>

              <Button
                variant={isConfiguredAndPaused ? "contained" : "outlined"}
                onClick={toggleCEFRPersonalization}
              >
                {isConfiguredAndPaused
                  ? i18n(
                      "cefr_enable_personalization",
                      "Enable CEFR personalization"
                    )
                  : i18n(
                      "cefr_pause_personalization",
                      "Pause CEFR personalization"
                    )}
              </Button>

              <Button variant="outlined" onClick={startQuiz}>
                {i18n("cefr_quiz_restart", "Retake quick quiz")}
              </Button>

              <Divider />

              <Typography variant="subtitle2">
                {i18n("cefr_manual_adjust_label", "Adjust manually")}
              </Typography>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {CEFR_LEVEL_OPTIONS.map(({ level }) => (
                  <Button
                    key={level}
                    variant={cefrSetting.level === level ? "contained" : "outlined"}
                    onClick={() => persistCEFRLevel(level, "manual")}
                  >
                    {getCEFRLabel(level, i18n)}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}
