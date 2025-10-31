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
  - [x] Safari
  - [x] Thunderbird
- [x] Supports multiple translation services
  - [x] Google/Microsoft
  - [x] Tencent/Volcengine
  - [x] OpenAI/Gemini/Claude/Ollama/DeepSeek/OpenRouter
  - [x] DeepL/DeepLX/NiuTrans
  - [x] AzureAI / CloudflareAI
  - [x] Chrome built-in AI translation (BuiltinAI)
- [x] Covers common translation scenarios
  - [x] Webpage bilingual translation
  - [x] Input-box translation
    - Instantly translate text in input fields into other languages via shortcut keys
  - [x] Text selection translation
    - [x] Open translation popup on any page, support multiple translation services for comparison
    - [x] English dictionary lookup
    - [x] Save vocabulary
  - [x] Hover translation
  - [x] YouTube subtitle translation
    - Support translating video subtitles with any translation service and display bilingually
    - Built-in basic subtitle merging and sentence-splitting algorithm to improve translation quality
    - Supports AI-powered sentence segmentation for even better translation
    - Custom subtitle style
- [x] Supports diverse translation modes
  - [x] Supports both automatic text recognition and manual rule modes
    - Automatic text recognition mode allows most sites to be translated fully without writing rules
    - Manual rule mode enables extreme optimization for specific sites
  - [x] Custom translation styling
  - [x] Supports rich-text translation and rendering, preserving links and other text styles where possible
  - [x] Option to show only translation (hide original text)
- [x] Advanced translation API features
  - [x] With custom API support, theoretically works with any translation service
  - [x] Batch aggregation of translation requests
  - [x] Supports AI conversation context memory to improve translation quality
  - [x] Custom AI terminology dictionary
  - [x] All APIs support hooks and custom parameters for advanced usage
- [x] Cross-client data synchronization
  - [x] KISS-Worker（cloudflare/docker）
  - [x] WebDAV
- [x] Custom translation rules
  - [x] Rule subscription/rule sharing
  - [x] Customized terminology
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
    - [ ] Safari (Mac)
    - [ ] Safari (iOS)
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

## Frequently Asked Questions

### How to Set Keyboard Shortcuts

Set this in the extension management page, for example:

- chrome [chrome://extensions/shortcuts](chrome://extensions/shortcuts)
- firefox [about:addons](about:addons)

### What is the priority order of rule settings?

Personal Rules > Subscription Rules > Global Rules

Among these, Global Rules have the lowest priority but are very important as they serve as the default rules.

### API (Ollama, etc.) Test Failure

Common reasons for API test failures include:

- Incorrect address:
  - For example, `Ollama` has a native API address and an `Openai`-compatible address. This plugin currently supports the `Openai`-compatible address and does not support the `Ollama` native API address.
- Some AI models do not support batch translation:
  - In this case, you can choose to disable batch translation or use a custom API.
  - Alternatively, you can use a custom API. For details, please refer to: [Custom API Example Documentation](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)
- Some AI models have inconsistent parameters:
  - For example, the parameters of the `Gemini` native API are highly inconsistent. Some model versions do not support certain parameters, leading to errors.
  - In this case, you can modify the request body using a `Hook`, or replace it with `Gemini2` (an OpenAI-compatible address).
- The server restricts cross-origin access, returning a 403 error:
  - For example, `Ollama` requires adding the environment variable `OLLAMA_ORIGINS=*` when starting. See: https://github.com/fishjar/kiss-translator/issues/174

### Custom API doesn't work in Tampermonkey scripts

Tampermonkey scripts require adding domains to the whitelist; otherwise, requests cannot be sent.

### How to set up a hook function for a custom API

Custom APIs are very powerful and flexible, and can theoretically connect to any translation API.

Example reference: [custom-api_v2.md](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)

### How to directly access the Tampermonkey script settings page

Settings page address: https://fishjar.github.io/kiss-translator/options.html

## Future Plans 

 This is a side project with no strict timeline. Community contributions are welcome. The following are preliminary feature directions:

- [x] **Batch Text Requests**: Optimize request strategy to reduce translation API calls and improve performance.
- [x] **Enhanced Rich Text Translation**: Support accurate translation of complex page structures and rich text content.
- [x] **Advanced Custom/AI Interfaces**: Add support for context memory, multi-turn conversations, and other advanced AI features.
- [x] **Fallback English Dictionary**: When translation services fail, fall back to a local dictionary lookup.
- [x] **Improved YouTube Subtitle Support**: Enhance merging and translation experience for streaming subtitles, reducing sentence fragmentation.
- [ ] **Upgraded Rule Collaboration System**: Introduce more flexible rule sharing, version management, and community review processes.

 If you're interested in any of these directions, feel free to discuss in [Issues](https://github.com/fishjar/kiss-translator/issues) or submit a PR!

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
