# KISS Translator

**New Version Preview:**

After a period of intermittent development, the planned features for the new version are essentially complete. The main new features are as follows:

* **Core Translation Logic Refactoring:**
    * Supports both automatic text detection and manual selection modes.
    * The automatic text detection mode enables complete translation for the vast majority of websites without the need to write specific rules.
    * The previous manual rule mode has been retained for meticulous optimization on specific websites.
    * Supports rich text translation, preserving links and other text styles from the original content as much as possible.
    * Optimize the display effect of showing only translated text (hiding original text).

* **API Refactoring:**
    * Supports adding and deleting an arbitrary number of APIs.
    * Supports aggregating text for sending, reducing the number of calls to the translation API and improving performance.
    * Supports the built-in Chrome AI translation API, enabling AI-powered translation without an internet connection.
    * Supports AI contextual conversation memory to enhance translation quality.
    * All APIs support advanced features such as hooks and custom parameters.
    * Added support for Azure AI translation interface.

* **Optimized YouTube Subtitle Support:**
    * Supports translating video subtitles with any translation service and displaying them bilingually.
    * Includes a built-in basic algorithm for subtitle merging and sentence splitting to improve translation results.
    * Supports an AI-powered sentence splitting function to further enhance translation quality.

* **English Dictionary Redundancy:**
    * Added Bing and Youdao dictionaries.
    * Fixed the vocabulary collection feature.

* **User Experience Optimization:**
    * The pop-up translation box for selected text now supports simultaneous translation by multiple services.
    * The translation control panel has been updated with many new quick-toggle functions.
    * Added a Playground page for convenient API debugging.

**Note:** Due to extensive refactoring, the configuration file for the new version is not backward compatible with the old version. Therefore, please back up your data manually before upgrading. Furthermore, **do not import old configuration files after upgrading to the new version.**

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
  - [x] BuiltinAI/AzureAI/CloudflareAI
  - [x] Custom translation interface
- [x] Covers common translation scenarios
  - [x] Web bilingual translation
  - [x] Input box translation
  - [x] Seletction translation
    - [x] Open the translation box on any page
    - [x] Favorite Words
  - [x] Mouseover translation
  - [x] YouTube subtitle translation
  - [x] Support for various translation effects
    - [x] Customizable text recognition and full-text translation
    - [x] Customizable translation styles
    - [x] Support for rich text translation and display
    - [x] Support for displaying only the translated text (hiding the original text)
  - [x] Advanced translation API features
    - [x] Aggregate and send translated texts in batches
    - [x] AI contextual conversation memory
    - [x] Customizable AI terminology dictionary
    - [x] AI-powered subtitle segmentation and translation
    - [x] Customizable hooks and parameters
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
> - Browser extensions have more complete functions (subtitle translation, local language recognition, context menu, etc.)
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

### Local Ollama interface cannot be used

If encountering a 403 error, refer to: https://github.com/fishjar/kiss-translator/issues/174

### Custom API doesn't work in Tampermonkey scripts

Tampermonkey scripts require adding domains to the whitelist; otherwise, requests cannot be sent.

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
