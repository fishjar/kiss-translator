# 简约翻译

一个简约的 [网页双语翻译扩展 & 油猴脚本](https://github.com/fishjar/kiss-translator)。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 缘由

本项目灵感来源于 [Immersive Translate](https://github.com/immersive-translate/immersive-translate)，在试用了后，发现搭配本人早前开发的 [网页划词翻译扩展](https://github.com/fishjar/kiss-dictionary) 一起使用，刚好形成很好补充。

但该扩展的功能对我来说有些繁杂了，而且只提供编译混淆后的安装包，没有提供源代码，无法满足我的一些个性化定制需求。

恰巧本人对翻译类工具有些执念，本着`“自用为主，能用就行”`的理念，于是动手撸了一个，目前初版完成，基本达到个人使用需求。

如果你也喜欢简约一点的，欢迎自取。

## 特性

- [x] 简约而不失灵性
- [x] 开放源代码
- [x] 适配常见浏览器
  - [x] Chrome/Edge/Firefox/Kiwi
  - [ ] Safari
- [x] 支持多种翻译服务
  - [x] Google/Microsoft/DeepL/OpenAI
  - [x] 自定义翻译接口
- [x] 覆盖常见翻译场景
  - [x] 网页双语翻译
  - [x] 输入框翻译
  - [x] 鼠标悬停翻译
  - [x] YouTube 字幕翻译
- [x] 跨客户端数据同步
- [x] 自定义翻译规则
  - [x] 规则订阅/规则分享
- [x] 自定义译文样式
- [x] 自定义快捷键
  - `Alt+Q` 开启翻译
  - `Alt+C` 切换样式
  - `Alt+K` 打开弹窗
  - `Alt+O` 打开设置
  - `Alt+I` 输入框翻译

## 安装

- [x] 浏览器扩展
  - [x] Chrome [安装地址](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=zh-CN)
  - [x] Edge [安装地址](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=zh-CN)
  - [x] Firefox [安装地址](https://addons.mozilla.org/zh-CN/firefox/addon/kiss-translator/)
  - [ ] Safari
- [x] 油猴脚本
  - [x] Chrome/Edge/Firefox ([Tampermonkey](https://www.tampermonkey.net/)/[Violentmonkey](https://violentmonkey.github.io/)) [安装链接 1](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)、 [安装链接 2](https://kiss-translator.rayjar.com/kiss-translator.user.js)
    - Greasy Fork [安装地址](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
  - [x] iOS Safari ([Userscripts Safari](https://github.com/quoid/userscripts)) [安装链接 1](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)、 [安装链接 2](https://kiss-translator.rayjar.com/kiss-translator.user-ios-safari.js)

## 关联项目

- 数据同步服务: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)
  - 可用于本项目的数据同步服务。
  - 亦可用于分享个人的私有规则列表。
  - 自己部署，自己管理，数据私有。
- 社区订阅规则: [https://github.com/fishjar/kiss-rules](https://github.com/fishjar/kiss-rules)
  - 提供社区维护的，最新最全的订阅规则列表。
  - 求助规则相关的问题。
- 网页修正脚本: [https://github.com/fishjar/kiss-webfixer](https://github.com/fishjar/kiss-webfixer)
  - 针对一些特殊网站的修正脚本。
  - 以便翻译软件得到更好的展示效果。
- 翻译接口代理: [https://github.com/fishjar/kiss-proxy](https://github.com/fishjar/kiss-proxy)
  - 如果访问某个翻译接口遇到网络问题，这个代理服务也许可以帮你到你。
  - 自己部署，自己管理。
- 简约词典插件: [https://github.com/fishjar/kiss-dictionary](https://github.com/fishjar/kiss-dictionary)
  - 搭配本项目一起使用的划词翻译插件。
  - 支持英文单词、句子、汉字的查询。
  - 支持历史记录、单词收藏。

## 开发指引

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
yarn install
yarn build
```

## 交流

- 加入 [Telegram 群](https://t.me/+RRCu_4oNwrM2NmFl)
