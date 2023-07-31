## KISS Translator

A minimalist [bilingual translation extension](https://github.com/fishjar/kiss-translator)。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

### Inspiration

The inspiration for this project comes from [Immersive Translate](https://github.com/immersive-translate/immersive-translate). After trying it out, I found that it can be used together with the [Webpage Word Translation Extension](https://github.com/fishjar/kiss-dictionary) developed by me earlier, which just forms a very good supplement.

But the function of this extension is a bit complicated for me, and only the compiled and obfuscated installation package is provided, and the source code is not provided, which cannot meet some of my personalized customization needs.

It just so happens that I am obsessed with translation tools. Based on the concept of "mainly for personal use, as long as you can use it", I made one. At present, the first version is completed, which basically meets the needs of personal use.

If you also like a little more simplicity, welcome to pick it up.

### Features

- Keep it simple, smart

### Schedule

- [x] Provide trial installation package
- [x] Adapt browser
  - [x] Chrome
  - [x] Edge
  - [x] Firefox
  - [ ] Safari
- [x] Support translation services
  - [x] Google
  - [x] Microsoft
  - [x] OpenAI
  - [ ] DeepL
- [ ] Upload to app Store
- [x] Open source
- [x] Data Synchronization Function

### Guide

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
yarn
yarn dist
```

### Data Sync

Goto: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)
