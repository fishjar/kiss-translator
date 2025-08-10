# 简约翻译

[English](README.en.md) | 简体中文

一个简约、开源的 [双语对照翻译扩展 & 油猴脚本](https://github.com/fishjar/kiss-translator)。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 特性

- [x] 保持简约
- [x] 开放源代码
- [x] 适配常见浏览器
  - [x] Chrome/Edge/Firefox/Kiwi/Orion
  - [ ] Safari
  - [x] Thunderbird
- [x] 支持多种翻译服务
  - [x] Google/Microsoft/DeepL/NiuTrans/OpenAI/Gemini/Ollama/CloudflareAI/Baidu/Tencent/Claude/Volcengine
  - [x] 自定义翻译接口
- [x] 覆盖常见翻译场景
  - [x] 网页双语对照翻译
  - [x] 输入框翻译
  - [x] 划词翻译
    - [x] 收藏词汇
  - [x] 鼠标悬停翻译
  - [x] YouTube 字幕翻译
- [x] 跨客户端数据同步
  - [x] KISS-Worker（cloudflare/docker）
  - [x] WebDAV
- [x] 自定义翻译规则
  - [x] 规则订阅/规则分享
  - [x] 自定义专业术语
- [x] 自定义译文样式
- [x] 自定义快捷键
  - `Alt+Q` 开启翻译
  - `Alt+C` 切换样式
  - `Alt+K` 打开设置弹窗
  - `Alt+S` 打开翻译弹窗/翻译选中文字
  - `Alt+O` 打开设置页面
  - `Alt+I` 输入框翻译

## 安装

> 注：基于以下原因，建议优先使用浏览器扩展
>
> - 浏览器扩展的功能更完整（本地语言识别、右键菜单等）
> - 油猴脚本会遇到更多使用上的问题（跨域问题、脚本冲突等）

- [x] 浏览器扩展
  - [x] Chrome [安装地址](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=zh-CN)
    - [x] Kiwi (Android)
    - [x] Orion (iOS)
  - [x] Edge [安装地址](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=zh-CN)
  - [x] Firefox [安装地址](https://addons.mozilla.org/zh-CN/firefox/addon/kiss-translator/)
  - [ ] Safari
  - [x] Thunderbird [下载地址](https://github.com/fishjar/kiss-translator/releases)
- [x] 油猴脚本
  - [x] Chrome/Edge/Firefox ([Tampermonkey](https://www.tampermonkey.net/)/[Violentmonkey](https://violentmonkey.github.io/)) [安装链接](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
    - [Greasy Fork](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
  - [x] iOS Safari ([Userscripts Safari](https://github.com/quoid/userscripts)) [安装链接](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## 关联项目

- 数据同步服务: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)
  - 可用于本项目的数据同步服务。
  - 亦可用于分享个人的私有规则列表。
  - 自己部署，自己管理，数据私有。
- 社区订阅规则: [https://github.com/fishjar/kiss-rules](https://github.com/fishjar/kiss-rules)
  - 提供社区维护的，最新最全的订阅规则列表。
  - 求助规则相关的问题。
- 翻译接口代理: [https://github.com/fishjar/kiss-proxy](https://github.com/fishjar/kiss-proxy)
  - 如果访问某个翻译接口遇到网络问题，这个代理服务也许可以帮到你。
  - 自己部署，自己管理。

## 常见问题

### 如何关闭自动翻译

通过规则设置，以下方法均可实现：

- 个人规则：全局规则 -> 开启翻译 -> 默认关闭
- 订阅规则：选择第三个 `kiss-rules-off.json`
- 覆写订阅规则：开启翻译 -> 默认关闭
- 添加一条针对某个网站的个人规则：开启翻译 -> 默认关闭

### 如何设置快捷键

在插件管理那里设置，例如： 

- chrome [chrome://extensions/shortcuts](chrome://extensions/shortcuts)
- firefox [cabout:addons](about:addons)

### 如何关闭划词翻译

通过规则设置：个人规则 -> 全局规则 -> 是否启用划词翻译 -> 禁用

### 如何设置仅显示译文

通过规则设置：个人规则 -> 全局规则 -> 仅显示译文 -> 启用

### 如何设置鼠标悬停翻译

通过规则设置：个人规则 -> 全局规则 -> 触发方式

### 为什么有些网页翻译不全

本插件的网页翻译是基于CSS选择器的，通用规则不能适配所有网页，有时需要自行添加相应网站的单独规则。如果不会写规则，可以到这里求助： https://github.com/fishjar/kiss-rules/issues

### 规则设置的优先级是如何的

个人规则 > 覆写订阅规则 > 订阅规则 > 订阅规则 > 全局规则

其中全局规则优先级最低，但非常重要，相当于默认规则。

### 为什么油管字幕一句话会断开翻译

本插件目前没有针对视频做特殊开发，对油管的支持也是当做网页翻译看待，自动生成字幕是流式生成并输出的，所以支持较差。

如果需要关闭本插件的字幕翻译，增加一条规则即可，参考：https://github.com/fishjar/kiss-translator/issues/62

### 本地的Ollama接口不能使用

如果出现403的情况，参考：https://github.com/fishjar/kiss-translator/issues/174

### 填写的接口在油猴脚本不能使用

油猴脚本需要增加域名白名单，否则不能发出请求。

## 开发指引

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
git checkout dev # 提交PR建议推送到dev分支
pnpm install
pnpm build
```

## 交流

- 加入 [Telegram 群](https://t.me/+RRCu_4oNwrM2NmFl)

## 赞赏

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)
