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
  CEFR_QUIZ_QUESTIONS,
  calculateQuizLevel,
  getCEFRLabel,
} from "./cefrQuiz";

function QuizView({ i18n, questionIndex, onSelectChoice }) {
  const question = CEFR_QUIZ_QUESTIONS[questionIndex];
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
              key={`${question.id}-${choice.score}`}
              variant="outlined"
              onClick={() => onSelectChoice(choice.score)}
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
    () => getCEFRLabel(cefrSetting.level),
    [cefrSetting.level]
  );

  const persistCEFRLevel = (level, levelSource) => {
    updateSetting({
      cefrSetting: {
        ...cefrSetting,
        enabled: level > 0,
        level,
        assessmentCompleted: true,
        levelSource,
      },
    });
  };

  const startQuiz = () => {
    setAnswers([]);
    setQuizVisible(true);
  };

  const handleSelectChoice = (score) => {
    const nextAnswers = [...answers, score];

    if (nextAnswers.length >= CEFR_QUIZ_QUESTIONS.length) {
      const resultLevel = calculateQuizLevel(nextAnswers);
      persistCEFRLevel(resultLevel, "quiz");
      setQuizVisible(false);
      setAnswers([]);
      return;
    }

    setAnswers(nextAnswers);
  };

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
                <Typography variant="h6">
                  {i18n("cefr_configured_title", "CEFR is configured")}
                </Typography>
                <Chip
                  label={`${i18n("cefr_current_level", "Current level")}: ${currentLevelLabel}`}
                  color="primary"
                  variant="outlined"
                />
              </Stack>

              <Typography>
                {`${i18n("cefr_current_level", "Current level")}: ${currentLevelLabel}`}
              </Typography>

              <Button variant="outlined" onClick={startQuiz}>
                {i18n("cefr_quiz_restart", "Retake quick quiz")}
              </Button>

              <Divider />

              <Typography variant="subtitle2">
                {i18n("cefr_manual_adjust_label", "Adjust manually")}
              </Typography>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {CEFR_LEVEL_OPTIONS.map(({ level, label }) => (
                  <Button
                    key={label}
                    variant={cefrSetting.level === level ? "contained" : "outlined"}
                    onClick={() => persistCEFRLevel(level, "manual")}
                  >
                    {label}
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
