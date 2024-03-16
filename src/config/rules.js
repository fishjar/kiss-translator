export const DEFAULT_SELECTOR = `:is(li, p, h1, h2, h3, h4, h5, h6, dd, blockquote)`;
export const DEFAULT_KEEP_SELECTOR = `code, img, svg`;

export const GLOBAL_KEY = "*";
export const REMAIN_KEY = "-";

export const SHADOW_KEY = ">>>";

export const DEFAULT_RULE = {
  pattern: "", // 匹配网址
  selector: "", // 选择器
  keepSelector: "", // 保留元素选择器
  terms: "", // 专业术语
  translator: GLOBAL_KEY, // 翻译服务
  fromLang: GLOBAL_KEY, // 源语言
  toLang: GLOBAL_KEY, // 目标语言
  textStyle: GLOBAL_KEY, // 译文样式
  transOpen: GLOBAL_KEY, // 开启翻译
  bgColor: "", // 译文颜色
  textDiyStyle: "", // 自定义译文样式
  selectStyle: "", // 选择器节点样式
  parentStyle: "", // 选择器父节点样式
  injectJs: "", // 注入JS
  injectCss: "", // 注入CSS
  transOnly: GLOBAL_KEY, // 是否仅显示译文
  transTiming: GLOBAL_KEY, // 翻译时机/鼠标悬停翻译
  transTag: GLOBAL_KEY, // 译文元素标签
  transTitle: GLOBAL_KEY, // 是否同时翻译页面标题
  detectRemote: GLOBAL_KEY, // 是否使用远程语言检测
  skipLangs: [], // 不翻译的语言
  fixerSelector: "", // 修复函数选择器
  fixerFunc: GLOBAL_KEY, // 修复函数
};

const DEFAULT_DIY_STYLE = `color: #666;
background: linear-gradient(
  45deg,
  LightGreen 20%,
  LightPink 20% 40%,
  LightSalmon 40% 60%,
  LightSeaGreen 60% 80%,
  LightSkyBlue 80%
);
&:hover {
  color: #333;
};`;

export const DEFAULT_OW_RULE = {
  translator: REMAIN_KEY,
  fromLang: REMAIN_KEY,
  toLang: REMAIN_KEY,
  textStyle: REMAIN_KEY,
  transOpen: REMAIN_KEY,
  bgColor: "",
  textDiyStyle: DEFAULT_DIY_STYLE,
};

const RULES_MAP = {
  "www.google.com/search": {
    selector: `h3, .IsZvec, .VwiC3b`,
  },
  "news.google.com": {
    selector: `[data-n-tid], ${DEFAULT_SELECTOR}`,
  },
  "www.foxnews.com": {
    selector: `h1, h2, .title, .sidebar [data-type="Title"], .article-content ${DEFAULT_SELECTOR}; [data-spotim-module="conversation"]>div >>> [data-spot-im-class="message-text"] p,  [data-spot-im-class="message-text"]`,
  },
  "bearblog.dev, www.theverge.com, www.tampermonkey.net/documentation.php": {
    selector: `${DEFAULT_SELECTOR}`,
  },
  "themessenger.com": {
    selector: `.leading-tight, .leading-tighter, .my-2 p, .font-body p, article ${DEFAULT_SELECTOR}`,
  },
  "www.telegraph.co.uk, go.dev/doc/": {
    selector: `article ${DEFAULT_SELECTOR}`,
  },
  "www.theguardian.com": {
    selector: `.show-underline, .dcr-hup5wm div, .dcr-7vl6y8 div, .dcr-12evv1c, figcaption, article ${DEFAULT_SELECTOR}, [data-cy="mostviewed-footer"] h4`,
  },
  "www.semafor.com": {
    selector: `${DEFAULT_SELECTOR}, .styles_intro__IYj__, [class*="styles_description"]`,
  },
  "www.noemamag.com": {
    selector: `.splash__title, .single-card__title, .single-card__type, .single-card__topic, .highlighted-content__title, .single-card__author, article ${DEFAULT_SELECTOR}, .quote__text, .wp-caption-text div`,
  },
  "restofworld.org": {
    selector: `${DEFAULT_SELECTOR}, .recirc-story__headline, .recirc-story__dek`,
  },
  "www.axios.com": {
    selector: `.h7, ${DEFAULT_SELECTOR}`,
  },
  "www.newyorker.com": {
    selector: `.summary-item__hed, .summary-item__dek, .summary-collection-grid__dek, .dqtvfu, .rubric__link, .caption, article ${DEFAULT_SELECTOR}, .HEhan ${DEFAULT_SELECTOR}, .ContributorBioBio-fBolsO, .BaseText-ewhhUZ`,
  },
  "time.com": {
    selector: `h1, h3, .summary, .video-title, #article-body ${DEFAULT_SELECTOR}, .image-wrap-container .credit.body-caption, .media-heading`,
  },
  "www.dw.com": {
    selector: `.ts-teaser-title a, .news-title a, .title a, .teaser-description a, .hbudab h3, .hbudab p, figcaption ,article ${DEFAULT_SELECTOR}`,
  },
  "www.bbc.com": {
    selector: `h1, h2, .media__link, .media__summary, article ${DEFAULT_SELECTOR}, .ssrcss-y7krbn-Stack, .ssrcss-17zglt8-PromoHeadline, .ssrcss-18cjaf3-Headline, .gs-c-promo-heading__title, .gs-c-promo-summary, .media__content h3, .article__intro, .lx-c-summary-points>li`,
  },
  "www.chinadaily.com.cn": {
    selector: `h1, .tMain [shape="rect"], .cMain [shape="rect"], .photo_art [shape="rect"], .mai_r [shape="rect"], .lisBox li, #Content ${DEFAULT_SELECTOR}`,
  },
  "www.facebook.com": {
    selector: `[role="main"] [dir="auto"]`,
  },
  "www.reddit.com, new.reddit.com, sh.reddit.com": {
    selector: `:is(#AppRouter-main-content, #overlayScrollContainer) :is([class^=tbIA],[class^=_1zP],[class^=ULWj],[class^=_2Jj], [class^=_334],[class^=_2Gr],[class^=_7T4],[class^=_1WO], ${DEFAULT_SELECTOR}); [id^="post-title"], :is([slot="text-body"], [slot="comment"]) ${DEFAULT_SELECTOR}, recent-posts h3, aside :is(span:has(>h2), p); shreddit-subreddit-header >>> :is(#title, #description)`,
  },
  "www.quora.com": {
    selector: `.qu-wordBreak--break-word`,
  },
  "edition.cnn.com": {
    selector: `.container__title, .container__headline, .headline__text, .image__caption, [data-type="Title"], .article__content ${DEFAULT_SELECTOR}`,
  },
  "www.reuters.com": {
    selector: `#main-content [data-testid="Heading"], #main-content [data-testid="Body"], .article-body__content__17Yit ${DEFAULT_SELECTOR}`,
  },
  "www.bloomberg.com": {
    selector: `[data-component="headline"], [data-component="related-item-headline"], [data-component="title"], article ${DEFAULT_SELECTOR}`,
  },
  "deno.land, docs.github.com": {
    selector: `main ${DEFAULT_SELECTOR}`,
    keepSelector: `code, img, svg`,
  },
  "doc.rust-lang.org": {
    selector: `.content ${DEFAULT_SELECTOR}`,
    keepSelector: `code, img, svg`,
  },
  "www.indiehackers.com": {
    selector: `h1, h3, .content ${DEFAULT_SELECTOR}, .feed-item__title-link`,
  },
  "platform.openai.com/docs": {
    selector: `.docs-body ${DEFAULT_SELECTOR}`,
    keepSelector: `code, img, svg`,
  },
  "en.wikipedia.org": {
    selector: `h1, .mw-parser-output ${DEFAULT_SELECTOR}`,
    keepSelector: `.mwe-math-element`,
  },
  "stackoverflow.com, serverfault.com, superuser.com, stackexchange.com, askubuntu.com, stackapps.com, mathoverflow.net":
    {
      selector: `.s-prose ${DEFAULT_SELECTOR}, .comment-copy, .question-hyperlink, .s-post-summary--content-title, .s-post-summary--content-excerpt`,
      keepSelector: `code, img, svg, .math-container`,
    },
  "www.npmjs.com/package, developer.chrome.com/docs, medium.com, react.dev, create-react-app.dev, pytorch.org":
    {
      selector: `article ${DEFAULT_SELECTOR}`,
    },
  "news.ycombinator.com": {
    selector: `.title, p`,
  },
  "github.com": {
    selector: `.markdown-body ${DEFAULT_SELECTOR}, .repo-description p, .Layout-sidebar .f4, .container-lg .py-4 .f5, .container-lg .my-4 .f5, .Box-row .pr-4, .Box-row article .mt-1, [itemprop="description"], .markdown-title, bdi, .ws-pre-wrap, .status-meta, span.status-meta, .col-10.color-fg-muted, .TimelineItem-body, .pinned-item-list-item-content .color-fg-muted, .markdown-body td, .markdown-body th`,
    keepSelector: `code, img, svg`,
  },
  "twitter.com": {
    selector: `[data-testid="tweetText"], [data-testid="birdwatch-pivot"]>div.css-1rynq56`,
    keepSelector: `img, a, .r-18u37iz, .css-175oi2r`,
  },
  "m.youtube.com": {
    selector: `.slim-video-information-title .yt-core-attributed-string, .media-item-headline .yt-core-attributed-string, .comment-text .yt-core-attributed-string, .typography-body-2b .yt-core-attributed-string, #ytp-caption-window-container .ytp-caption-segment`,
  },
  "www.youtube.com": {
    selector: `h1, #video-title, #content-text, #title, yt-attributed-string>span>span, #ytp-caption-window-container .ytp-caption-segment`,
  },
  "bard.google.com": {
    selector: `.query-content ${DEFAULT_SELECTOR}, message-content ${DEFAULT_SELECTOR}`,
  },
  "www.bing.com, copilot.microsoft.com": {
    selector: `.b_algoSlug, .rwrl_padref; .cib-serp-main >>> .ac-textBlock ${DEFAULT_SELECTOR}, .text-message-content div`,
  },
  "www.phoronix.com": {
    selector: `article ${DEFAULT_SELECTOR}`,
  },
  "wx2.qq.com": {
    selector: `.js_message_plain`,
  },
  "app.slack.com/client/": {
    selector: `.p-rich_text_section, .c-message_attachment__text, .p-rich_text_list li`,
  },
  "discord.com/channels/": {
    selector: `div[class^=message], div[class^=headerText], div[class^=name_], section[aria-label='Search Results'] div[id^=message-content], div[id^=message]`,
    keepSelector: `li[class^='card'] div[class^='message'], [class^='embedFieldValue'], [data-list-item-id^='forum-channel-list'] div[class^='headerText']`,
  },
  "t.me/s/": {
    selector: `.js-message_text ${DEFAULT_SELECTOR}`,
  },
  "web.telegram.org/k": {
    selector: `div.kiss-p`,
    keepSelector: `div[class^=time], .peer-title, .document-wrapper, .message.spoilers-container custom-emoji-element, reactions-element`,
  },
  "web.telegram.org/a": {
    selector: `.text-content > .kiss-p`,
    keepSelector: `.Reactions, .time, .peer-title, .document-wrapper, .message.spoilers-container custom-emoji-element`,
  },
  "www.instagram.com/": {
    selector: `h1, article span[dir=auto] > span[dir=auto], ._ab1y`,
  },
  "www.instagram.com/p/,www.instagram.com/reels/": {
    selector: `h1, div[class='x9f619 xjbqb8w x78zum5 x168nmei x13lgxp2 x5pf9jr xo71vjh x1uhb9sk x1plvlek xryxfnj x1c4vz4f x2lah0s xdt5ytf xqjyukv x1cy8zhl x1oa3qoh x1nhvcw1'] > span[class='x1lliihq x1plvlek xryxfnj x1n2onr6 x193iq5w xeuugli x1fj9vlw x13faqbe x1vvkbs x1s928wv xhkezso x1gmr53x x1cpjm7i x1fgarty x1943h6x x1i0vuye xvs91rp xo1l8bm x5n08af x10wh9bi x1wdrske x8viiok x18hxmgj'], span[class='x193iq5w xeuugli x1fj9vlw x13faqbe x1vvkbs xt0psk2 x1i0vuye xvs91rp xo1l8bm x5n08af x10wh9bi x1wdrske x8viiok x18hxmgj']`,
  },
  "mail.google.com": {
    selector: `${DEFAULT_SELECTOR}, span[data-thread-id]`,
  },
  "web.whatsapp.com": {
    selector: `.copyable-text > span`,
  },
  "chat.openai.com": {
    selector: `div[data-message-author-role] > div ${DEFAULT_SELECTOR}`,
  },
  "forum.ru-board.com": {
    selector: `.tit, .dats, .kiss-p, .lgf ${DEFAULT_SELECTOR}`,
  },
  "education.github.com": {
    selector: `${DEFAULT_SELECTOR}, a, summary, span.Button-content`,
  },
  "blogs.windows.com": {
    selector: `${DEFAULT_SELECTOR}, .c-uhf-nav-link, figcaption`,
  },
  "developer.apple.com/documentation/": {
    selector: `#main ${DEFAULT_SELECTOR}, #main .abstract .content, #main .abstract.content, #main .link span`,
    keepSelector: `code, img, svg`,
  },
  "greasyfork.org": {
    selector: `h2, .script-link, .script-description, #additional-info ${DEFAULT_SELECTOR}`,
  },
  "www.fmkorea.com": {
    selector: `#container ${DEFAULT_SELECTOR}`,
  },
  "forum.arduino.cc": {
    selector: `.top-row>.title, .featured-topic>.title, .link-top-line>.title, .category-description, .topic-excerpt, .fancy-title, .cooked ${DEFAULT_SELECTOR}`,
  },
  "docs.arduino.cc": {
    selector: `[class^="tutorial-module--left"] ${DEFAULT_SELECTOR}`,
  },
  "www.historydefined.net": {
    selector: `.wp-element-caption, ${DEFAULT_SELECTOR}`,
  },
  "gobyexample.com": {
    selector: `.docs p`,
    keepSelector: `code`,
  },
  "go.dev/tour": {
    selector: `#left-side ${DEFAULT_SELECTOR}`,
    keepSelector: `code, img, svg >>> code`,
  },
  "pkg.go.dev": {
    selector: `.Documentation-content ${DEFAULT_SELECTOR}`,
    keepSelector: `code, img, svg, a, span`,
  },
  "docs.rs": {
    selector: `.docblock ${DEFAULT_SELECTOR}, .docblock-short`,
    keepSelector: `code >>> code`,
  },
  "randomnerdtutorials.com": {
    selector: `article ${DEFAULT_SELECTOR}`,
  },
  "notebooks.githubusercontent.com/view/ipynb": {
    selector: `#notebook-container ${DEFAULT_SELECTOR}`,
    keepSelector: `code, img, svg`,
  },
  "developers.cloudflare.com": {
    selector: `article ${DEFAULT_SELECTOR}, .WorkerStarter--description`,
    keepSelector: `a[rel='noopener'], code`,
  },
};

export const BUILTIN_RULES = Object.entries(RULES_MAP)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(
    ([
      pattern,
      {
        selector,
        keepSelector = "",
        terms = "",
        selectStyle = "",
        parentStyle = "",
        injectCss = "",
        fixerSelector = "",
        fixerFunc = GLOBAL_KEY,
      },
    ]) => ({
      ...DEFAULT_RULE,
      pattern,
      selector,
      keepSelector,
      terms,
      selectStyle,
      parentStyle,
      injectCss,
      fixerSelector,
      fixerFunc,
    })
  );
