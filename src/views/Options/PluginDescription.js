import { useId, useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import { useI18n } from "../../hooks/I18n";
import limitPluginDescription from "./limitPluginDescription";

const PREVIEW_LINES = 3;

function safeLink(url) {
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    return new URL(url).href;
  } catch {
    return "";
  }
}

const markdownComponents = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: () => null,
};

function DescriptionContent({ source, variant }) {
  const i18n = useI18n();
  const id = useId();
  const previewRef = useRef(null);
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    const content = contentRef.current;
    const measure = () => {
      const previewHeight =
        parseFloat(getComputedStyle(content).lineHeight) * PREVIEW_LINES;
      const bounds = content.getBoundingClientRect();
      const overflow = bounds.height > previewHeight + 0.5;
      setOverflows(overflow);
      for (const link of content.querySelectorAll("a[href]")) {
        const clipped =
          !expanded &&
          overflow &&
          Array.from(link.getClientRects()).some(
            (rect) => rect.bottom > bounds.top + previewHeight + 0.5
          );
        if (clipped) link.tabIndex = -1;
        else link.removeAttribute("tabindex");
      }
    };

    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    observer.observe(content);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        component="div"
        ref={previewRef}
        id={id}
        variant={variant}
        color={variant === "body2" ? "text.secondary" : "text.primary"}
        sx={{
          lineHeight: 1.5,
          overflowWrap: "anywhere",
          "&:not([data-expanded])": {
            maxHeight: `${PREVIEW_LINES * 1.5}em`,
            overflow: "clip",
          },
          "& p, & ul, & ol, & blockquote, & pre, & hr, & h1, & h2, & h3, & h4, & h5, & h6":
            { margin: 0, fontSize: "inherit", lineHeight: "inherit" },
          "& ul, & ol": { paddingInlineStart: "1.5em" },
          "& blockquote": {
            borderInlineStart: "2px solid",
            borderColor: "divider",
            paddingInlineStart: "0.5em",
          },
          "& pre": { whiteSpace: "pre-wrap" },
          "& a": { color: "primary.main" },
        }}
        data-expanded={expanded ? "" : undefined}
      >
        <div ref={contentRef}>
          <ReactMarkdown
            skipHtml
            rehypePlugins={[limitPluginDescription]}
            transformLinkUri={safeLink}
            components={markdownComponents}
          >
            {source}
          </ReactMarkdown>
        </div>
      </Typography>
      {overflows && (
        <Button
          size="small"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {i18n(
            expanded ? "plugin_description_less" : "plugin_description_more"
          )}
        </Button>
      )}
    </Box>
  );
}

export default function PluginDescription({ description, variant = "body2" }) {
  return typeof description === "string" && description.trim() ? (
    <DescriptionContent
      key={description}
      source={description}
      variant={variant}
    />
  ) : null;
}
