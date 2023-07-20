const els = `li, p, h1, h2, h3, h4, h5, h6, dd`;

export const DEFAULT_SELECTOR =
  process.env.REACT_APP_BROWSER === "firefox"
    ? `:is(${els})`
    : `:is(${els}):not(:has(:is(${els})))`;

export const RULES = [
  {
    pattern: `platform.openai.com/docs`,
    selector: `.docs-body ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `en.wikipedia.org`,
    selector: `h1, .mw-parser-output ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `stackoverflow.com`,
    selector: `h1, .s-prose p, .comment-body .comment-copy`,
  },
  {
    pattern: `developer.chrome.com/docs, medium.com`,
    selector: `h1, article ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `news.ycombinator.com`,
    selector: `.title, .commtext`,
  },
  {
    pattern: `github.com`,
    selector: `.markdown-body ${DEFAULT_SELECTOR}, .repo-description p, .Layout-sidebar .f4, .container-lg .py-4 .f5, .container-lg .my-4 .f5, .Box-row .pr-4, .Box-row article .mt-1, [itemprop='description']`,
  },
  {
    pattern: `twitter.com`,
    selector: `[data-testid='tweetText']`,
  },
  {
    pattern: `youtube.com`,
    selector: `h1, h3:not(:has(#author-text)), #content-text, #description, yt-attributed-string>span>span`,
  },
];
