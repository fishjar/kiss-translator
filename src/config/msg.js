/**
 * @file msg.js
 * @description 定义插件内部通信及快捷键命令的消息类型常量。用于 Content Script、Background Script、Options 和 Popup 之间的消息传递。
 */

// --- 浏览器扩展快捷键 / 菜单命令类型 ---
export const CMD_TOGGLE_TRANSLATE = "toggleTranslate"; // 切换网页双语翻译
export const CMD_TOGGLE_TRANSLATE_ONLY = "toggleTranslateOnly"; // 切换网页仅显示译文（单语翻译模式）
export const CMD_TOGGLE_STYLE = "toggleStyle"; // 切换译文样式效果
export const CMD_OPEN_OPTIONS = "openOptions"; // 打开选项配置页面
export const CMD_OPEN_TRANBOX = "openTranbox"; // 开启划词翻译面板
export const CMD_TOGGLE_TRANBOX = "toggleTranbox"; // 显隐划词翻译面板
export const CMD_OPEN_SEPARATE_WINDOW = "openSeparateWindow"; // 打开独立的翻译悬浮窗口

// --- 扩展运行中的内部通信 Message Action 常量 ---
export const MSG_FETCH = "kiss_fetch"; // 代理请求 (避免内容脚本跨域限制)
export const MSG_GET_HTTPCACHE = "get_httpcache"; // 获取网页翻译请求的本地缓存
export const MSG_PUT_HTTPCACHE = "put_httpcache"; // 写入翻译请求的缓存数据
export const MSG_OPEN_OPTIONS = "open_options"; // 打开扩展设置页面消息
export const MSG_SAVE_RULE = "save_rule"; // 保存自定义的网页翻译规则
export const MSG_TRANS_TOGGLE = "toggle_translate"; // 广播切换双语翻译消息
export const MSG_TRANS_TOGGLE_ONLY = "toggle_translate_only"; // 广播切换仅显示译文消息
export const MSG_TRANS_TOGGLE_STYLE = "toggle_styles"; // 广播切换译文样式消息
export const MSG_OPEN_TRANBOX = "open_tranbox"; // 广播开启划词翻译面板消息
export const MSG_TRANS_GETRULE = "trans_getrule"; // 获取网页匹配的特定规则
export const MSG_TRANS_PUTRULE = "trans_putrule"; // 保存或应用网页翻译规则
export const MSG_TRANS_CURRULE = "trans_currule"; // 发送当前页面所适配的有效规则
export const MSG_TRANSBOX_TOGGLE = "toggle_transbox"; // 切换划词翻译框的显示与隐藏
export const MSG_POPUP_TOGGLE = "toggle_popup"; // 切换 Popup 弹窗的显隐状态
export const MSG_MOUSEHOVER_TOGGLE = "toggle_mousehover"; // 切换鼠标悬停翻译功能
export const MSG_HOVERNODE_TOGGLE = "toggle_hover_node"; // 切换针对某节点的悬浮高亮状态
export const MSG_TRANSINPUT_TOGGLE = "toggle_input_translation"; // 切换输入框翻译功能
export const MSG_INPUT_TRANSLATE = "input_translate"; // 触发输入框即时翻译
export const MSG_CONTEXT_MENUS = "context_menus"; // 更新或创建右键上下文菜单
export const MSG_COMMAND_SHORTCUTS = "command_shortcuts"; // 获取扩展注册的全局快捷键
export const MSG_INJECT_JS = "inject_js"; // 在主文档环境中注入并运行 inline JS
export const MSG_INJECT_CSS = "inject_css"; // 在主文档或 Shadow Root 中注入自定义 CSS
export const MSG_UPDATE_CSP = "update_csp"; // 请求后台脚本动态更新内容安全策略(CSP)及请求头 Origin
export const MSG_BUILTINAI_DETECT = "builtinai_detect"; // 调用内置 AI 执行语言检测
export const MSG_BUILTINAI_TRANSLATE = "builtinai_translte"; // 调用内置 AI 执行文本翻译
export const MSG_SET_LOGLEVEL = "set_loglevel"; // 设置当前会话的日志等级
export const MSG_CLEAR_CACHES = "clear_caches"; // 请求后台脚本清理本地翻译 HTTP 缓存
export const MSG_OPEN_SEPARATE_WINDOW = "open_separate_window"; // 请求后台脚本开启独立窗口
export const PORT_STREAM_FETCH = "kiss_stream_fetch"; // 双向长连接端口名称：用于大模型翻译时的流式输出通道
export const MSG_UPDATE_ICON = "update_icon"; // 通知后台脚本更新扩展的工具栏图标状态 (激活/灰色状态)
export const MSG_SHA256 = "sha256"; // 请求后台脚本代算 SHA-256 签名

// --- 用于 Window.postMessage 与自定义事件通信的事件名称 ---
export const EVENT_KISS_INNER = "kiss_translator_inner"; // 插件沙箱/内容脚本内部事件
export const EVENT_KISS_TRANSLATOR = "kiss_translator"; // 暴露给网页环境的外部交互事件

// --- 视频与字幕翻译特定消息类型 ---
export const MSG_XHR_DATA_YOUTUBE = "KISS_XHR_DATA_YOUTUBE"; // 传递 YouTube 拦截到的字幕 XHR 数据

// --- 字幕菜单控制状态类型 ---
export const MSG_MENUS_PROGRESSED = "progressed"; // 进度事件
export const MSG_MENUS_UPDATEFORM = "updateFormData"; // 更新表单参数数据
