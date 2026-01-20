# KISS Translator Fork - 新增功能说明

本分支为 KISS Translator 添加了两个新功能：

## 新增功能

### 1. CTRL+选中触发模式

新增了一个触发模式，可以在以下条件下触发翻译：
- 选中文本 AND
- 按住 CTRL 键

可以在扩展设置中选择此触发模式：设置 → 划词翻译 → 触发方式 → CTRL+选中触发

**实现细节：**
- 在 `src/config/setting.js` 中添加了新常量 `OPT_TRANBOX_TRIGGER_CTRL_SELECT`
- 添加到可用触发模式数组 `OPT_TRANBOX_TRIGGER_ALL`
- 为所有支持的语言添加了 i18n 翻译
- 更新了鼠标松开事件处理器，在 CTRL+选中模式下检查 `e.ctrlKey`

### 2. 弹出窗口默认显示翻译标签页

点击工具栏扩展图标时，弹出窗口现在默认显示翻译标签页，而不是设置标签页。

**实现细节：**
- 在 `src/views/Popup/index.js` 中将 `showTrantab` 的初始状态从 `false` 改为 `true`

## 安装说明

### 在 Chrome 中加载扩展

1. 下载构建好的扩展包（在仓库根目录查找 `build/chrome` 文件夹）
2. 或者从构建产物中解压 zip 文件
3. 打开 Chrome 浏览器，访问 `chrome://extensions/`
4. 在右上角启用"开发者模式"
5. 点击"加载已解压的扩展程序"按钮
6. 选择解压后的 `chrome` 文件夹
7. 扩展现在应该已安装并激活

### 使用 CTRL+选中触发功能

1. 点击扩展图标打开设置
2. 切换到设置标签页（点击顶部的齿轮图标）
3. 找到"划词翻译"部分
4. 在"触发方式"下拉菜单中选择"CTRL+选中触发"
5. 设置会自动保存
6. 现在，当你在任何网页上选中文本并同时按住 CTRL 键时，翻译将自动显示

## 从源码构建

如需从源码构建扩展：

```bash
# 安装依赖
pnpm install

# 构建 Chrome 扩展
unset CI && pnpm build:chrome

# 构建的扩展将位于 build/chrome/ 目录
```

## 最小化改动原则

这些更改遵循最小化改动的设计原则：
- 仅修改了 4 个文件
- 不改变核心翻译逻辑
- 易于与上游更新合并
- 功能清晰分离

## 修改的文件

1. `src/config/setting.js` - 添加新触发模式常量
2. `src/config/i18n.js` - 添加新触发模式的翻译
3. `src/views/Selection/index.js` - 添加 CTRL 键检测逻辑
4. `src/views/Popup/index.js` - 将默认标签页改为翻译

## 构建产物

- 构建的 Chrome 扩展包大小：1.1MB
- 包含所有必需的文件和本地化资源
- 可直接在 Chrome 或基于 Chromium 的浏览器中安装使用

## 注意事项

- 这些更改与上游仓库兼容，方便后续同步上游更新
- 所有新功能都是可选的，不影响现有功能
- 代码遵循项目现有的代码风格和架构
