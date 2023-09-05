# KISS Translator

A minimalist [bilingual translation Extension & Greasemonkey Script](https://github.com/fishjar/kiss-translator).

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## Inspiration

The inspiration for this project comes from [Immersive Translate](https://github.com/immersive-translate/immersive-translate). After trying it out, I found that it can be used together with the [Webpage Word Translation Extension](https://github.com/fishjar/kiss-dictionary) developed by me earlier, which just forms a very good supplement.

But the function of this extension is a bit complicated for me, and only the compiled and obfuscated installation package is provided, and the source code is not provided, which cannot meet some of my personalized customization needs.

It just so happens that I am obsessed with translation tools. Based on the concept of "mainly for personal use, as long as you can use it", I made one. At present, the first version is completed, which basically meets the needs of personal use.

If you also like a little more simplicity, welcome to pick it up.

## Features

- Keep it simple, smart

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

## Description

### Support shortcut keys

- `Alt+Q` Toggle Translation
- `Alt+C` Toggle Styles
- `Alt+K` Open Menu

## Schedule

- [x] Provide trial installation package
- [x] Adapt browser
  - [x] Chrome
  - [x] Edge
  - [x] Firefox
  - [ ] Safari
  - [x] Kiwi
- [x] Support translation services
  - [x] Google
  - [x] Microsoft
  - [x] DeepL
  - [x] OpenAI
- [x] Upload to app Store
  - [x] Chrome [Install Link](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof)
  - [x] Edge [Install Link](https://microsoftedge.microsoft.com/addons/detail/kiss-translator/jemckldkclkinpjighnoilpbldbdmmlh)
  - [x] Firefox [Install Link](https://addons.mozilla.org/en-US/firefox/addon/kiss-translator/)
  - [ ] Safari
  - [x] Greasy Fork [Install Link](https://greasyfork.org/en/scripts/472840-kiss-translator)
- [x] Open source
- [x] Data Synchronization Function
- [x] Greasemonkey Script ([Setting Page 1](https://fishjar.github.io/kiss-translator/options.html)、[Setting Page 2](https://kiss-translator.rayjar.com/options))
  - [x] [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox) [Install Link 1](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)、[Install Link 2](https://kiss-translator.rayjar.com/kiss-translator.user.js)
  - [x] [Violentmonkey](https://violentmonkey.github.io/) (Chrome/Edge/Firefox) [Install Link 1](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)、[Install Link 2](https://kiss-translator.rayjar.com/kiss-translator.user.js)
  - [x] [Userscripts Safari](https://github.com/quoid/userscripts) (iOS Safari) [Install Link 1](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)、[Install Link 2](https://kiss-translator.rayjar.com/kiss-translator.user-ios-safari.js)

## Guide

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
yarn install
yarn build
```

## Discussion

- Join [Telegram Group](https://t.me/+RRCu_4oNwrM2NmFl)
