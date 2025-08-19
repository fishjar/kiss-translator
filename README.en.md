# KISS Translator

English | [简体中文](README.md)

A simple, open source [bilingual translation extension & Greasemonkey script](https://github.com/fishjar/kiss-translator).

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## Features

- [x] Keep it simple, smart
- [x] Open source
- [x] Adapt to common browsers
  - [x] Chrome/Edge
  - [x] Firefox
  - [x] Kiwi (Android)
  - [x] Orion (iOS)
  - [ ] Safari
    - [x] Safari (Mac)
  - [x] Thunderbird
- [x] Supports multiple translation services
  - [x] Google/Microsoft
  - [x] Baidu/Tencent/Volcengine
  - [x] OpenAI/Gemini/Claude/Ollama/DeepSeek/CloudflareAI
  - [x] DeepL/DeepLX/NiuTrans
  - [x] Custom translation interface
- [x] Covers common translation scenarios
  - [x] Web bilingual translation
  - [x] Input box translation
  - [x] Seletction translation
    - [x] Favorite Words
  - [x] Mouseover translation
  - [x] YouTube subtitle translation
- [x] Cross-client data synchronization
  - [x] KISS-Worker（cloudflare/docker）
  - [x] WebDAV
- [x] Custom translation rules
  - [x] Rule subscription/rule sharing
  - [x] Customized terminology
- [x] Custom translation style
- [x] Custom shortcut keys
  - `Alt+Q` Toggle Translation
  - `Alt+C` Toggle Styles
  - `Alt+K` Open Setting Popup
  - `Alt+S` Open Translate Popup / Translate Selected Text
  - `Alt+O` Open Options Page
  - `Alt+I` Input Box Translation

## Install

> Note: For the following reasons, it is recommended to use browser extensions first
>
> - Browser extensions have more complete functions (local language recognition, context menu, etc.)
> - Grease Monkey script will encounter more usage problems (cross domain issues, script conflicts, etc.)

- [x] Browser extension
  - [x] Chrome [Installation address](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=zh-CN)
    - [x] Kiwi (Android)
    - [x] Orion (iOS)
  - [x] Edge [Installation address](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=zh-CN)
  - [x] Firefox [Installation address](https://addons.mozilla.org/zh-CN/firefox/addon/kiss-translator/)
  - [ ] Safari
    - [x] Safari (Mac) Compiled by a third party, not verified, obtained by yourself: https://www.nodeloc.com/t/topic/54245
  - [x] Thunderbird [Download address](https://github.com/fishjar/kiss-translator/releases)
- [x] GreaseMonkey Script
  - [x] Chrome/Edge/Firefox ([Tampermonkey](https://www.tampermonkey.net/)/[Violentmonkey](https://violentmonkey.github.io/)) [Installation link](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
    - [Greasy Fork](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
  - [x] iOS Safari ([Userscripts Safari](https://github.com/quoid/userscripts)) [Installation link](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## Associated Projects

- Data synchronization service: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)
  - Data synchronization service available for this project.
  - Can also be used to share personal private rule lists.
  - Deploy by yourself, manage by yourself, data is private.
- Community subscription rules: [https://github.com/fishjar/kiss-rules](https://github.com/fishjar/kiss-rules)
  - Provides the latest and most complete list of subscription rules maintained by the community.
  - Help with rules-related issues.
- Translation interface agent: [https://github.com/fishjar/kiss-proxy](https://github.com/fishjar/kiss-proxy)
  - If you encounter network problems when accessing a certain translation interface, this proxy service may help you.
  - Deploy and manage by yourself.

## Frequently Asked Questions

### How to Turn Off Automatic Translation

You can achieve this through `Rules Setting` with the following methods:

- Personal Rules: RULES-> Global Rule -> Translate Switch -> Disaabled
- Subscription Rules: SUBSCRIBE -> Select the third option `kiss-rules-off.json`
- Override Subscription Rules: OVERWRITE -> Translate Switch -> Disaabled
- Add a Personal Rule for a Specific Website: Translate Switch -> Disaabled

### How to Set Keyboard Shortcuts

Set this in the extension management page, for example:

- chrome [chrome://extensions/shortcuts](chrome://extensions/shortcuts)
- firefox [about:addons](about:addons)

### How to Turn Off Selection Translation

Set this in the `Rules Setting`: RULES -> Global Rule -> If translate selected -> Disable

### How to Set it to Show Only the Translation

Set this in the `Rules Setting`: RULES -> Global Rule -> Show Only Translations -> Enable

### How to Set Mouse Hover Translation

Set this in the `Rules Setting`: RULES -> Global Rule -> TTrigger Mode

### Why are some web pages not fully translated?

This extension's webpage translation is based on CSS selectors. Generic rules cannot adapt to all websites, and sometimes you need to manually add site-specific rules. If you don't know how to write rules, you can seek help here:  
https://github.com/fishjar/kiss-rules/issues

### What is the priority order of rule settings?

Personal Rules > Override Subscription Rules > Subscription Rules > Global Rules

Among these, Global Rules have the lowest priority but are very important as they serve as the default rules.

### Why are YouTube subtitles translated in broken sentences?

This extension has no special development for video content. Support for YouTube is also treated as regular webpage translation. Auto-generated subtitles are streamed and output progressively, resulting in poorer support.

To disable this extension's subtitle translation, add a rule. Reference: https://github.com/fishjar/kiss-translator/issues/62

### Local Ollama interface cannot be used

If encountering a 403 error, refer to: https://github.com/fishjar/kiss-translator/issues/174

### Custom API doesn't work in Tampermonkey scripts

Tampermonkey scripts require adding domains to the whitelist; otherwise, requests cannot be sent.

### How to Set Up Hook Functions for Custom Interfaces

The custom interface feature is highly flexible and can theoretically integrate with any translation interface.

Example of a Request Hook function:

```js
/**
 * Request Hook
 * @param {string} text Text to be translated
 * @param {string} from Source language
 * @param {string} to   Target language
 * @param {string} url  Translation interface URL
 * @param {string} key  Translation interface API key
 * @returns {Array[string, object]} [Interface URL, request object]
 */
(text, from, to, url, key) => [url, {
  headers: {
    "Content-type": "application/json",
    "Authorization": `Bearer ${key}`
  },
  method: "POST",
  body: { text, to },
}]
```

Example of a Response Hook function:

```js
 * Response Hook
 * @param {string} res  JSON data returned by the interface
 * @param {string} text Text to be translated
 * @param {string} from Source language
 * @param {string} to   Target language
 * @returns {Array[string, boolean]} [Translated text, whether target language is same as source]
 * Note: If the second return value is true (target language same as source), 
 *       the translation will not be displayed on the page,
 *       If the parameters are incomplete, it is recommended to return false directly
 */
(res, text, from, to) => [res.text, to === res.src]
```

For more custom interface examples, refer to: [custom-api.md](https://github.com/fishjar/kiss-translator/blob/master/custom-api.md)

<<<<<<< HEAD
## Future Plans 

 This is a side project with no strict timeline. Community contributions are welcome. The following are preliminary feature directions:

- [ ] **Batch Text Requests**: Optimize request strategy to reduce translation API calls and improve performance.
- [ ] **Enhanced Rich Text Translation**: Support accurate translation of complex page structures and rich text content.
- [ ] **Advanced Custom/AI Interfaces**: Add support for context memory, multi-turn conversations, and other advanced AI features.
- [ ] **Fallback English Dictionary**: When translation services fail, fall back to a local dictionary lookup.
- [ ] **Improved YouTube Subtitle Support**: Enhance merging and translation experience for streaming subtitles, reducing sentence fragmentation.
- [ ] **Upgraded Rule Collaboration System**: Introduce more flexible rule sharing, version management, and community review processes.

 If you're interested in any of these directions, feel free to discuss in [Issues](https://github.com/fishjar/kiss-translator/issues) or submit a PR!

=======
>>>>>>> 39b3b00117ee4f9a43c9489638bf7438db5c2101
## Development Guidelines

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
git checkout dev # Submit a PR suggestion to push to the dev branch
pnpm install
pnpm build
```

## Discussion

- Join [Telegram Group](https://t.me/+RRCu_4oNwrM2NmFl)

## Appreciate

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)
