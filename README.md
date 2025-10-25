# 简约翻译

> **新版预告**：
>
> 经过一段时间断续开发，新版的预期功能已基本完成，主要引入的新特性如下：
>
>   - 核心翻译逻辑重构：
>     - 支持自动识别文本与手动选择两种模式。
>     - 自动识别文本模式使得绝大部分网站无需编写规则也能翻译完整。
>     - 保留之前的手动规则模式，可以针对特定网站极致优化。
>     - 支持富文本翻译，能够尽量保留原文中的链接及其他文本样式。
>     - 优化仅显示译文（隐藏原文）显示效果。
>   - 接口重构：
>     - 支持添加、删除任意数量的接口。
>     - 支持聚合发送文本，减少翻译接口调用次数，提升性能。
>     - 支持chrome内置AI翻译接口，无需通过网络即可实现AI翻译。
>     - 支持AI上下文会话记忆功能，提升翻译效果。
>     - 所有接口均支持Hook和自定义参数等高级功能。
>     - 新增Azure AI翻译接口支持
>   - 优化 YouTube 字幕支持：
>     - 支持任意翻译服务对视频字幕进行翻译并双语显示。
>     - 内置基础的字幕合并与断句算法，提升翻译效果。
>     - 支持AI断句功能，可进一步提升翻译质量。
>   - 英文词典备灾：
>     - 新增bing、有道词典。
>     - 修复词汇收藏功能。
>   - 用户操作优化：
>     - 划词翻译框支持多种翻译服务同时翻译。
>     - 翻译控制面板新增许多快捷切换功能。
>     - 新增Playground页面，方便调试接口。
>
> 注意：由于经过大量重构，使得新版配置文件很难与旧版兼容，因此在升级前请手动备份相关数据。并且，**升级新版后，勿再导入旧版配置**。

[English](README.en.md) | 简体中文

一个简约、开源的 [双语对照翻译扩展 & 油猴脚本](https://github.com/fishjar/kiss-translator)。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 特性

- [x] 保持简约
- [x] 开放源代码
- [x] 适配常见浏览器
  - [x] Chrome/Edge
  - [x] Firefox
  - [x] Kiwi (Android)
  - [x] Orion (iOS)
  - [x] Safari
  - [x] Thunderbird
- [x] 支持多种翻译服务
  - [x] Google/Microsoft
  - [x] Tencent/Volcengine
  - [x] OpenAI/Gemini/Claude/Ollama/DeepSeek/OpenRouter
  - [x] DeepL/DeepLX/NiuTrans
  - [x] BuiltinAI/AzureAI/CloudflareAI
  - [x] 自定义翻译接口
- [x] 覆盖常见翻译场景
  - [x] 网页双语对照翻译
  - [x] 输入框翻译
  - [x] 划词翻译
    - [x] 任意页面打开翻译框
    - [x] 收藏词汇
  - [x] 鼠标悬停翻译
  - [x] YouTube 字幕翻译
- [x] 支持多样翻译效果
  - [x] 自定识别文本，全文翻译
  - [x] 自定义译文样式
  - [x] 支持富文本翻译及显示
  - [x] 支持仅显示译文（隐藏原文）
- [x] 翻译接口高级功能
  - [x] 聚合批量发送翻译文本
  - [x] AI上下文会话记忆
  - [x] 自定义AI术语词典
  - [x] 字幕文本AI智能断句及翻译
  - [x] 自定义Hook，自定义参数
- [x] 跨客户端数据同步
  - [x] KISS-Worker（cloudflare/docker）
  - [x] WebDAV
- [x] 自定义翻译规则
  - [x] 规则订阅/规则分享
  - [x] 自定义专业术语
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
    - [ ] Safari (Mac)
    - [ ] Safari (iOS) 
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

## 常见问题

### 如何设置快捷键

在插件管理那里设置，例如： 

- chrome [chrome://extensions/shortcuts](chrome://extensions/shortcuts)
- firefox [about:addons](about:addons)

### 规则设置的优先级是如何的

个人规则 > 订阅规则 > 全局规则

其中全局规则优先级最低，但非常重要，相当于兜底规则。

### 本地的Ollama接口不能使用

如果出现403的情况，参考：https://github.com/fishjar/kiss-translator/issues/174

### 填写的接口在油猴脚本不能使用

油猴脚本需要增加域名白名单，否则不能发出请求。

### 如何设置自定义接口的hook函数

自定义接口功能非常强大、灵活，理论可以接入任何翻译接口。

示例参考： [custom-api_v2.md](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)

### 如何直接进入油猴脚本设置页面

设置页面地址： https://fishjar.github.io/kiss-translator/options.html

## 未来规划 

 本项目为业余开发，无严格时间表，欢迎社区共建。以下为初步设想的功能方向：

- [x] **聚合发送文本**：优化请求策略，减少翻译接口调用次数，提升性能。
- [x] **增强富文本翻译**：支持更复杂的页面结构和富文本内容的准确翻译。
- [x] **强化自定义/AI 接口**：支持上下文记忆、多轮对话等高级 AI 功能。
- [x] **英文词典备灾机制**：当翻译服务失效时，可切换其他词典或 fallback 到本地词典查询。
- [x] **优化 YouTube 字幕支持**：改进流式字幕的合并与翻译体验，减少断句。
- [ ] **规则共建机制升级**：引入更灵活的规则分享、版本管理与社区评审流程。
 
 如果你对某个方向感兴趣，欢迎在 [Issues](https://github.com/fishjar/kiss-translator/issues) 中讨论或提交 PR！

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
