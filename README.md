# 简约翻译

一个简约的 [双语网页翻译扩展 & 油猴脚本](https://github.com/fishjar/kiss-translator)。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 缘由

本项目灵感来源于 [Immersive Translate](https://github.com/immersive-translate/immersive-translate)，在试用了后，发现搭配本人早前开发的 [网页划词翻译扩展](https://github.com/fishjar/kiss-dictionary) 一起使用，刚好形成很好补充。

但该扩展的功能对我来说有些繁杂了，而且只提供编译混淆后的安装包，没有提供源代码，无法满足我的一些个性化定制需求。

恰巧本人对翻译类工具有些执念，本着`“自用为主，能用就行”`的理念，于是动手撸了一个，目前初版完成，基本达到个人使用需求。

如果你也喜欢简约一点的，欢迎自取。

## 特点

- 保持简约

## 快捷键

- `Alt+Q` 开启翻译
- `Alt+C` 切换样式
- `Alt+K` 打开菜单

## 进度

- [x] 提供试用安装包
- [x] 适配浏览器
  - [x] Chrome
  - [x] Edge
  - [x] Firefox
  - [ ] Safari
  - [x] Kiwi
- [x] 支持翻译服务
  - [x] Google
  - [x] Microsoft
  - [x] DeepL
  - [x] OpenAI
- [x] 上架应用市场
  - [x] Chrome [安装地址](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=zh-CN)
  - [x] Edge [安装地址](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=zh-CN)
  - [x] Firefox [安装地址](https://addons.mozilla.org/zh-CN/firefox/addon/kiss-translator/)
  - [ ] Safari
  - [x] Greasy Fork [安装地址](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
- [x] 开放源代码
- [x] 数据同步功能
- [x] 油猴脚本 ([设置页面 1](https://fishjar.github.io/kiss-translator/options.html)、[设置页面 2](https://kiss-translator.rayjar.com/options))
  - [x] [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox) [安装链接 1](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)、[安装链接 2](https://kiss-translator.rayjar.com/kiss-translator.user.js)
  - [x] [Violentmonkey](https://violentmonkey.github.io/) (Chrome/Edge/Firefox) [安装链接 1](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)、[安装链接 2](https://kiss-translator.rayjar.com/kiss-translator.user.js)
  - [x] [Userscripts Safari](https://github.com/quoid/userscripts) (iOS Safari) [安装链接 1](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)、[安装链接 2](https://kiss-translator.rayjar.com/kiss-translator.user-ios-safari.js)

## 指引

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
yarn install
yarn build
```

## 数据同步

移步: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)

## 交流

- 加入 [Telegram 群](https://t.me/+RRCu_4oNwrM2NmFl)
