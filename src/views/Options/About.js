import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ReactMarkdown from "react-markdown";
import { useI18n, useI18nMd } from "../../hooks/I18n";
import Button from "@mui/material/Button";
import Logo from "../../components/Logo";
import { SettingsAdvanced } from "./SettingsCard";

const MARKDOWN_COMPONENTS = {
  a: ({ href, children }) => {
    const normalizedHref = href?.trim();
    const hasUnsafeScheme =
      normalizedHref &&
      /^[a-z][a-z0-9+.-]*:/i.test(normalizedHref) &&
      !/^(https?|mailto):/i.test(normalizedHref);

    if (!normalizedHref || hasUnsafeScheme) {
      return <span>{children}</span>;
    }

    return <a href={normalizedHref}>{children}</a>;
  },
};

/**
 * 关于面板组件 (在设置页展示关于/帮助的 MD 格式文档)
 */
function AboutDetails() {
  const i18n = useI18n();
  const { data, loading, error } = useI18nMd("about_md");

  return loading ? (
    <div className="kt-about-loading">
      <CircularProgress size={24} />
    </div>
  ) : (
    <ReactMarkdown components={MARKDOWN_COMPONENTS}>
      {error ? i18n("about_md_local") : data}
    </ReactMarkdown>
  );
}

export default function About() {
  const i18n = useI18n();

  return (
    <Box className="kt-about-page">
      <section className="kt-about-hero">
        <Logo size={72} className="kt-about-hero__logo" />
        <h2>
          {i18n("app_name")} <span>· {i18n("settings_chinese_name")}</span>
        </h2>
        <div className="kt-about-hero__version">
          v{process.env.REACT_APP_VERSION}
        </div>
        <p>{i18n("settings_about_description")}</p>
        <small>{i18n("settings_about_license")}</small>
        <div className="kt-about-hero__actions">
          <Button
            component="a"
            variant="contained"
            href={process.env.REACT_APP_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
          >
            {i18n("settings_check_updates")}
          </Button>
          <Button
            component="a"
            variant="outlined"
            href={process.env.REACT_APP_HOMEPAGE}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </Button>
          <Button
            component="a"
            variant="outlined"
            href={process.env.REACT_APP_SITEURL}
            target="_blank"
            rel="noreferrer"
          >
            {i18n("settings_project_website")}
          </Button>
        </div>
      </section>

      <SettingsAdvanced
        className="kt-about-details"
        label={i18n("settings_project_details")}
      >
        <div className="kt-about-markdown">
          <AboutDetails />
        </div>
      </SettingsAdvanced>
    </Box>
  );
}
