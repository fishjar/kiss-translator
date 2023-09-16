# KISS Translator

A minimalist [bilingual translation Extension & Greasemonkey Script](https://github.com/fishjar/kiss-translator).

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## Inspiration

The inspiration for this project comes from [Immersive Translate](https://github.com/immersive-translate/immersive-translate). After trying it out, I found that it can be used together with the [Webpage Word Translation Extension](https://github.com/fishjar/kiss-dictionary) developed by me earlier, which just forms a very good supplement.

But the function of this extension is a bit complicated for me, and only the compiled and obfuscated installation package is provided, and the source code is not provided, which cannot meet some of my personalized customization needs.

It just so happens that I am obsessed with translation tools. Based on the concept of "mainly for personal use, as long as you can use it", I made one. At present, the first version is completed, which basically meets the needs of personal use.

If you also like a little more simplicity, welcome to pick it up.

## Features

- [x] Keep it simple, smart
- [x] Open source
- [x] Adapt to common browsers
  - [x] Chrome/Edge/Firefox/Kiwi
  - [ ] Safari
- [x] Supports multiple translation services
  - [x] Google/Microsoft/DeepL/OpenAI
  - [x] Custom translation interface
- [x] Covers common translation scenarios
  - [x] Web bilingual translation
  - [x] Input box translation
  - [x] Mouseover translation
  - [x] YouTube subtitle translation
- [x] Cross-client data synchronization
- [x] Custom translation rules
  - [x] Rule subscription/rule sharing
- [x] Custom translation style
- [x] Custom shortcut keys
  - `Alt+Q` Toggle Translation
  - `Alt+C` Toggle Styles
  - `Alt+K` Open Popup
  - `Alt+O` Open Options
  - `Alt+I` Input Box Translation

## Install

- [x] Browser extension
  - [x] Chrome [Installation address](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=zh-CN)
  - [x] Edge [Installation address](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=zh-CN)
  - [x] Firefox [Installation address](https://addons.mozilla.org/zh-CN/firefox/addon/kiss-translator/)
  - [ ] Safari
- [x] GreaseMonkey Script
  - [x] Chrome/Edge/Firefox ([Tampermonkey](https://www.tampermonkey.net/)/[Violentmonkey](https://violentmonkey.github.io/)) [Installation link 1](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)、 [Installation link 2](https://kiss-translator.rayjar.com/kiss-translator.user.js)
    - Greasy Fork [Installation address](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
  - [x] iOS Safari ([Userscripts Safari](https://github.com/quoid/userscripts)) [Installation link 1](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)、 [Installation link 2](https://kiss-translator.rayjar.com/kiss-translator.user-ios-safari.js)

## Associated ProjectS

- Data synchronization service: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)
  - Data synchronization service available for this project.
  - Can also be used to share personal private rule lists.
  - Deploy by yourself, manage by yourself, data is private.
- Community subscription rules: [https://github.com/fishjar/kiss-rules](https://github.com/fishjar/kiss-rules)
  - Provides the latest and most complete list of subscription rules maintained by the community.
  - Help with rules-related issues.
- Web page correction script: [https://github.com/fishjar/kiss-webfixer](https://github.com/fishjar/kiss-webfixer)
  - Fixed scripts for some special sites.
  - So that the translation software can get better display effect.
- Translation interface agent: [https://github.com/fishjar/kiss-proxy](https://github.com/fishjar/kiss-proxy)
  - If you encounter network problems when accessing a certain translation interface, this proxy service may help you.
  - Deploy and manage by yourself.
- Minimalistic Dictionary Plugin: [https://github.com/fishjar/kiss-dictionary](https://github.com/fishjar/kiss-dictionary)
  - A word-marking translation plug-in used with this project.
  - Supports query of English words, sentences and Chinese characters.
  - Supports history records and word collections.

## Development Guidelines

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
yarn install
yarn build
```

## Discussion

- Join [Telegram Group](https://t.me/+RRCu_4oNwrM2NmFl)
