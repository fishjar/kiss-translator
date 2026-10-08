import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";
import { useI18n, useI18nMd } from "../../hooks/I18n";
import Button from "@mui/material/Button";
import Logo from "../../components/Logo";
import { SettingsAdvanced } from "./SettingsCard";

// What the README's HTML blocks (e.g. the sponsors table) may use.
const README_HTML = {
  RETURN_DOM_FRAGMENT: true,
  ALLOWED_TAGS: [
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "p",
    "div",
    "br",
  ].concat(["a", "img", "b", "strong", "em", "i", "span"]),
  ALLOWED_ATTR: [
    "href",
    "target",
    "src",
    "alt",
    "title",
    "width",
    "height",
    "align",
  ],
};

const toHast = (node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return { type: "text", value: node.data };
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const properties = Object.fromEntries(
    Array.from(node.attributes, ({ name, value }) => [name, value])
  );
  if (node.localName === "a" && properties.target === "_blank") {
    properties.rel = ["noopener", "noreferrer"];
  }
  return {
    type: "element",
    tagName: node.localName,
    properties,
    children: Array.from(node.childNodes, toHast).filter(Boolean),
  };
};

/**
 * react-markdown 8 prints raw HTML as text. Sanitize each top-level HTML block
 * of the remote README with DOMPurify and pass it on as elements; inline HTML
 * fragments cannot be sanitized alone and are dropped by `skipHtml`.
 */
export const rehypeReadmeHtml = () => (tree) => {
  tree.children = tree.children.flatMap((node) =>
    node.type === "raw"
      ? Array.from(
          DOMPurify.sanitize(node.value, README_HTML).childNodes,
          toHast
        ).filter(Boolean)
      : [node]
  );
};

/**
 * Render the localized project details in Markdown.
 */
function AboutDetails() {
  const i18n = useI18n();
  const { data, loading, error } = useI18nMd("about_md");

  return loading ? (
    <div className="kt-about-loading">
      <CircularProgress size={24} />
    </div>
  ) : (
    <ReactMarkdown skipHtml rehypePlugins={[rehypeReadmeHtml]}>
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
        <h2>{i18n("app_name")}</h2>
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
