const els = `li, p, h1, h2, h3, h4, h5, h6, dd`;

export const DEFAULT_SELECTOR = `:is(${els})`;

export const RULES = [
  {
    pattern: `bearblog.dev, www.theverge.com, www.tampermonkey.net/documentation.php`,
    selector: DEFAULT_SELECTOR,
  },
  {
    pattern: `https://news.google.com/`,
    selector: `h4`,
  },
  {
    pattern: `themessenger.com`,
    selector: `.leading-tight, .leading-tighter, .my-2 p, .font-body p, article ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.telegraph.co.uk`,
    selector: `article ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.theguardian.com`,
    selector: `.show-underline, .dcr-hup5wm div, .dcr-7vl6y8 div, .dcr-12evv1c, figcaption, article ${DEFAULT_SELECTOR}, [data-cy="mostviewed-footer"] h4`,
  },
  {
    pattern: `www.semafor.com`,
    selector: `${DEFAULT_SELECTOR}, .styles_intro__IYj__, [class*="styles_description"]`,
  },
  {
    pattern: `www.noemamag.com`,
    selector: `.splash__title, .single-card__title, .single-card__type, .single-card__topic, .highlighted-content__title, .single-card__author, article ${DEFAULT_SELECTOR}, .quote__text, .wp-caption-text div`,
  },
  {
    pattern: `restofworld.org`,
    selector: `${DEFAULT_SELECTOR}, .recirc-story__headline, .recirc-story__dek`,
  },
  {
    pattern: `www.axios.com`,
    selector: `.h7, ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.newyorker.com`,
    selector: `.summary-item__hed, .summary-item__dek, .summary-collection-grid__dek, .dqtvfu, .rubric__link, .caption, article ${DEFAULT_SELECTOR}, .HEhan ${DEFAULT_SELECTOR}, .ContributorBioBio-fBolsO`,
  },
  {
    pattern: `https://time.com/`,
    selector: `h1, h3, .summary, .video-title, #article-body ${DEFAULT_SELECTOR}, .image-wrap-container .credit.body-caption, .media-heading`,
  },
  {
    pattern: `www.dw.com`,
    selector: `.ts-teaser-title a, .news-title a, .title a, .teaser-description a, .hbudab h3, .hbudab p, figcaption ,article ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.bbc.com`,
    selector: `h1, h2, .media__link, .media__summary, article ${DEFAULT_SELECTOR}, .ssrcss-y7krbn-Stack, .ssrcss-1mrs5ns-PromoLink, .ssrcss-18cjaf3-Headline, .gs-c-promo-heading__title, .gs-c-promo-summary, .media__content h3, .article__intro`,
  },
  {
    pattern: `www.chinadaily.com.cn`,
    selector: `h1, .tMain [shape="rect"], .cMain [shape="rect"], .photo_art [shape="rect"], .mai_r [shape="rect"], .lisBox li, #Content ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.facebook.com`,
    selector: `[role="main"] [dir="auto"]`,
  },
  {
    pattern: `www.reddit.com`,
    selector: `[slot="title"], [slot="text-body"] ${DEFAULT_SELECTOR}, #-post-rtjson-content p`,
  },
  {
    pattern: `www.quora.com`,
    selector: `.qu-wordBreak--break-word`,
  },
  {
    pattern: `edition.cnn.com`,
    selector: `.container__title, .container__headline, .headline__text, .image__caption, [data-type="Title"], .article__content ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.reuters.com`,
    selector: `#main-content [data-testid="Heading"], #main-content [data-testid="Body"], .article-body__content__17Yit ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.bloomberg.com`,
    selector: `[data-component="headline"], [data-component="related-item-headline"], [data-component="title"], article ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `deno.land, docs.github.com`,
    selector: `main ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `doc.rust-lang.org`,
    selector: `#content ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `www.indiehackers.com`,
    selector: `h1, h3, .content ${DEFAULT_SELECTOR}, .feed-item__title-link`,
  },
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
    pattern: `www.npmjs.com/package/, developer.chrome.com/docs, medium.com, developers.cloudflare.com, react.dev, create-react-app.dev, pytorch.org/`,
    selector: `article ${DEFAULT_SELECTOR}`,
  },
  {
    pattern: `news.ycombinator.com`,
    selector: `.title, .commtext`,
  },
  {
    pattern: `https://github.com/`,
    selector: `.markdown-body ${DEFAULT_SELECTOR}, .repo-description p, .Layout-sidebar .f4, .container-lg .py-4 .f5, .container-lg .my-4 .f5, .Box-row .pr-4, .Box-row article .mt-1, [itemprop='description']`,
  },
  {
    pattern: `twitter.com`,
    selector: `[data-testid='tweetText']`,
  },
  {
    pattern: `youtube.com`,
    selector: `h1, #video-title, #content-text, #title, yt-attributed-string>span>span`,
  },
  {
    pattern: `www.google.com/search`,
    selector: `h3, .IsZvec, .VwiC3b`,
  },
];
