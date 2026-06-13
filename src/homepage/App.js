import React, { useMemo } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BoltIcon from "@mui/icons-material/Bolt";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import CodeIcon from "@mui/icons-material/Code";
import GitHubIcon from "@mui/icons-material/GitHub";
import InputIcon from "@mui/icons-material/Input";
import IntegrationInstructionsIcon from "@mui/icons-material/IntegrationInstructions";
import LanguageIcon from "@mui/icons-material/Language";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RuleIcon from "@mui/icons-material/Rule";
import SettingsIcon from "@mui/icons-material/Settings";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import SyncIcon from "@mui/icons-material/Sync";
import TerminalIcon from "@mui/icons-material/Terminal";
import TranslateIcon from "@mui/icons-material/Translate";
import VisibilityIcon from "@mui/icons-material/Visibility";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CssBaseline from "@mui/material/CssBaseline";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import ThemeProvider from "@mui/material/styles/ThemeProvider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { homepageContent, languageOptions } from "./content";
import { getHomepageTheme, getHomepageTokens } from "./theme";
import { useHomepageSettings } from "./useHomepageSettings";

const featureIcons = [
  TranslateIcon,
  LanguageIcon,
  InputIcon,
  VisibilityIcon,
  SubtitlesIcon,
  IntegrationInstructionsIcon,
  BoltIcon,
  RuleIcon,
  SyncIcon,
];

const externalLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer",
};

function LogoMark({ tokens }) {
  return (
    <Box
      component="img"
      src="images/logo192.png"
      alt="KISS Translator"
      sx={{
        width: { xs: 34, sm: 38 },
        height: { xs: 34, sm: 38 },
        borderRadius: 2,
        border: `1px solid ${tokens.border}`,
        boxShadow: `0 0 0 4px ${tokens.panelSoft}`,
      }}
    />
  );
}

function Header({
  content,
  language,
  setLanguage,
  themeMode,
  toggleThemeMode,
  tokens,
}) {
  const compact = useMediaQuery("(max-width:520px)");

  return (
    <Stack
      component="header"
      direction={{ xs: "column", md: "row" }}
      alignItems={{ xs: "stretch", md: "center" }}
      justifyContent="space-between"
      spacing={2}
      sx={{
        py: { xs: 2, sm: 2.5 },
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      <Stack direction="row" spacing={1.4} alignItems="center">
        <LogoMark tokens={tokens} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 760, lineHeight: 1 }}>
            KISS Translator
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {content.eyebrow}
          </Typography>
        </Box>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent={{ xs: "space-between", md: "flex-end" }}
        sx={{ flexWrap: "wrap", rowGap: 1 }}
      >
        <Button
          component={Link}
          href={process.env.REACT_APP_HOMEPAGE}
          {...externalLinkProps}
          startIcon={<GitHubIcon />}
          endIcon={compact ? null : <OpenInNewIcon />}
          variant="text"
          color="inherit"
          sx={{ minWidth: 0 }}
        >
          {content.navGithub}
        </Button>
        <FormControl size="small" sx={{ minWidth: { xs: 132, sm: 168 } }}>
          <Select
            native
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label={content.languageLabel}
            sx={{
              borderRadius: 2,
              fontWeight: 700,
              ".MuiSelect-select": {
                py: 1,
              },
            }}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormControl>
        <Tooltip
          title={themeMode === "dark" ? content.themeLight : content.themeDark}
        >
          <IconButton
            onClick={toggleThemeMode}
            color="inherit"
            aria-label={
              themeMode === "dark" ? content.themeLight : content.themeDark
            }
            sx={{
              border: `1px solid ${tokens.border}`,
              bgcolor: tokens.panel,
              width: 40,
              height: 40,
            }}
          >
            {themeMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

function Hero({ content, tokens }) {
  return (
    <Box
      component="section"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.08fr) 0.92fr" },
        gap: { xs: 3, lg: 4 },
        alignItems: "stretch",
        py: { xs: 5, sm: 7, lg: 8 },
      }}
    >
      <Stack spacing={3} justifyContent="center" sx={{ minWidth: 0 }}>
        <Chip
          icon={<TerminalIcon />}
          label={`${content.version} ${process.env.REACT_APP_VERSION}`}
          sx={{
            alignSelf: "flex-start",
            border: `1px solid ${tokens.borderStrong}`,
            bgcolor: tokens.panelSoft,
            color: "primary.main",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 800,
          }}
        />
        <Stack spacing={2}>
          <Typography
            component="h1"
            variant="h1"
            sx={{
              fontSize: { xs: "2rem", sm: "3rem", lg: "4rem" },
              lineHeight: { xs: 1.08, sm: 1.02 },
              maxWidth: 840,
            }}
          >
            {content.title}
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: "text.secondary",
              fontWeight: 500,
              lineHeight: 1.65,
              maxWidth: 760,
              fontSize: { xs: "1rem", sm: "1.14rem" },
            }}
          >
            {content.subtitle}
          </Typography>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.4}
          sx={{ width: { xs: "100%", sm: "auto" } }}
        >
          <Button
            component={Link}
            href={process.env.REACT_APP_HOMEPAGE}
            {...externalLinkProps}
            variant="contained"
            size="large"
            startIcon={<AutoAwesomeIcon />}
            sx={{ minHeight: 48 }}
          >
            {content.installExtension}
          </Button>
          <Button
            component={Link}
            href={process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}
            variant="outlined"
            size="large"
            startIcon={<CodeIcon />}
            sx={{ minHeight: 48 }}
          >
            {content.installUserscript}
          </Button>
          <Button
            component={Link}
            href={process.env.REACT_APP_OPTIONSPAGE}
            variant="text"
            size="large"
            startIcon={<SettingsIcon />}
            sx={{ minHeight: 48 }}
          >
            {content.openOptions}
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {content.status.map((item) => (
            <Chip
              key={item}
              label={item}
              variant="outlined"
              sx={{
                borderColor: tokens.border,
                color: "text.secondary",
                fontWeight: 700,
              }}
            />
          ))}
        </Stack>
      </Stack>

      <Card
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          border: `1px solid ${tokens.border}`,
          bgcolor: tokens.panel,
          boxShadow: tokens.shadow,
          alignSelf: "center",
        }}
      >
        <Stack spacing={2.2}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={2}
          >
            <Typography variant="overline" sx={{ color: "text.secondary" }}>
              providers.ready
            </Typography>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: "primary.main",
                boxShadow: `0 0 24px ${tokens.code}`,
                flex: "0 0 auto",
              }}
            />
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                sm: "repeat(3, minmax(0, 1fr))",
              },
              gap: 1,
            }}
          >
            {content.providers.map((provider) => (
              <Box
                key={provider}
                sx={{
                  minHeight: 42,
                  display: "flex",
                  alignItems: "center",
                  px: 1.4,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 2,
                  bgcolor: tokens.panelSoft,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  color: "text.primary",
                  overflowWrap: "anywhere",
                }}
              >
                {provider}
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              border: `1px solid ${tokens.border}`,
              borderRadius: 2,
              p: 1.5,
              bgcolor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(2, 6, 23, 0.48)"
                  : "rgba(248, 250, 252, 0.82)",
              color: tokens.code,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: { xs: "0.76rem", sm: "0.82rem" },
              lineHeight: 1.9,
              overflowWrap: "anywhere",
            }}
          >
            <Box>{"> page.translate({ mode: 'bilingual' })"}</Box>
            <Box>{"> subtitle.youtube({ aiSegment: true })"}</Box>
            <Box>{"> api.hooks({ streaming: true })"}</Box>
          </Box>
        </Stack>
      </Card>
    </Box>
  );
}

function InstallMatrix({ content, tokens }) {
  return (
    <Box component="section" sx={{ py: { xs: 3, sm: 5 } }}>
      <SectionHeader
        title={content.installTitle}
        subtitle={content.installSubtitle}
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
          gap: 1.5,
        }}
      >
        {content.installs.map((item) => (
          <Card
            key={item.name}
            component={Link}
            href={item.href}
            {...externalLinkProps}
            elevation={0}
            underline="none"
            sx={{
              p: 2,
              minHeight: 104,
              border: `1px solid ${tokens.border}`,
              bgcolor: tokens.panel,
              color: "text.primary",
              transition: "border-color 160ms ease, transform 160ms ease",
              "&:hover": {
                borderColor: tokens.borderStrong,
                transform: "translateY(-2px)",
              },
            }}
          >
            <Stack
              direction="row"
              alignItems="flex-start"
              justifyContent="space-between"
              spacing={2}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 760 }}>
                  {item.name}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {item.meta}
                </Typography>
              </Box>
              <OpenInNewIcon
                sx={{ color: "text.secondary", flex: "0 0 auto" }}
              />
            </Stack>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <Stack spacing={1} sx={{ mb: { xs: 2, sm: 2.5 }, maxWidth: 760 }}>
      <Typography
        component="h2"
        variant="h2"
        sx={{ fontSize: { xs: "1.65rem", sm: "2.15rem" } }}
      >
        {title}
      </Typography>
      <Typography sx={{ color: "text.secondary", lineHeight: 1.7 }}>
        {subtitle}
      </Typography>
    </Stack>
  );
}

function FeatureDashboard({ content, tokens }) {
  return (
    <Box component="section" sx={{ py: { xs: 4, sm: 6 } }}>
      <SectionHeader
        title={content.featureTitle}
        subtitle={content.featureSubtitle}
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
          gap: 1.5,
        }}
      >
        {content.features.map((feature, index) => {
          const Icon = featureIcons[index] || TranslateIcon;
          return (
            <Card
              key={feature.title}
              elevation={0}
              sx={{
                p: 2,
                minHeight: { xs: "auto", sm: 176 },
                border: `1px solid ${tokens.border}`,
                bgcolor: tokens.panel,
              }}
            >
              <Stack spacing={1.6}>
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    color: "primary.main",
                    bgcolor: tokens.panelSoft,
                    border: `1px solid ${tokens.border}`,
                  }}
                >
                  <Icon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 760, mb: 0.8 }}>
                    {feature.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary", lineHeight: 1.68 }}
                  >
                    {feature.body}
                  </Typography>
                </Box>
              </Stack>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}

function Ecosystem({ content, tokens }) {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 4, sm: 6 },
        borderTop: `1px solid ${tokens.border}`,
      }}
    >
      <SectionHeader
        title={content.ecosystemTitle}
        subtitle={content.ecosystemSubtitle}
      />
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {[
          "kiss-worker",
          "kiss-rules",
          "WebDAV",
          "Hooks",
          "Streaming",
          "Context memory",
          "Custom terminology",
        ].map((item) => (
          <Chip
            key={item}
            label={item}
            sx={{
              bgcolor: tokens.panelSoft,
              border: `1px solid ${tokens.border}`,
              fontWeight: 760,
            }}
          />
        ))}
      </Stack>
    </Box>
  );
}

function Homepage() {
  const { language, setLanguage, themeMode, toggleThemeMode } =
    useHomepageSettings();
  const content = homepageContent[language] || homepageContent.en;
  const theme = useMemo(() => getHomepageTheme(themeMode), [themeMode]);
  const tokens = useMemo(() => getHomepageTokens(themeMode), [themeMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          backgroundImage: (muiTheme) =>
            muiTheme.palette.mode === "dark"
              ? "linear-gradient(rgba(94, 234, 212, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(94, 234, 212, 0.045) 1px, transparent 1px)"
              : "linear-gradient(rgba(15, 118, 110, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 118, 110, 0.05) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      >
        <Box
          sx={{
            width: "min(1180px, calc(100% - 32px))",
            mx: "auto",
            "@media (max-width: 420px)": {
              width: "calc(100% - 24px)",
            },
          }}
        >
          <Header
            content={content}
            language={language}
            setLanguage={setLanguage}
            themeMode={themeMode}
            toggleThemeMode={toggleThemeMode}
            tokens={tokens}
          />
          <Hero content={content} tokens={tokens} />
          <InstallMatrix content={content} tokens={tokens} />
          <FeatureDashboard content={content} tokens={tokens} />
          <Ecosystem content={content} tokens={tokens} />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default Homepage;
