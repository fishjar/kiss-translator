# 安装和使用指南 / Installation Guide

## 中文说明

### 如何安装扩展

1. **下载扩展文件**
   - 扩展文件位于: `build/chrome/` 目录
   
2. **在 Chrome 中加载扩展**
   - 打开 Chrome 浏览器
   - 在地址栏输入: `chrome://extensions/`
   - 在右上角启用"开发者模式"开关
   - 点击"加载已解压的扩展程序"按钮
   - 选择 `build/chrome/` 文件夹
   - 扩展安装完成！

### 如何使用新功能

#### 功能 1: CTRL+选中触发翻译

1. 点击浏览器工具栏的扩展图标
2. 在弹出窗口中，点击顶部的齿轮图标切换到设置标签页
3. 找到"划词翻译"部分
4. 点击"触发方式"下拉菜单
5. 选择"CTRL+选中触发"
6. 设置自动保存

**使用方法：**
- 在任意网页上选中文本
- 同时按住键盘上的 CTRL 键（左边或右边的 CTRL 都可以）
- 翻译窗口会自动弹出显示翻译结果

#### 功能 2: 默认显示翻译标签页

- 现在点击扩展图标时，会直接显示翻译输入框
- 无需手动切换标签页
- 可以立即输入要翻译的内容

### 技术细节

**修改的文件：**
- `src/config/setting.js` - 添加新触发模式
- `src/config/i18n.js` - 添加多语言翻译
- `src/views/Selection/index.js` - 实现 CTRL 键检测
- `src/views/Popup/index.js` - 设置默认标签页

**总代码更改：**
- 4 个文件
- +16 行代码
- -1 行代码

---

## English Instructions

### How to Install the Extension

1. **Download Extension Files**
   - Extension files are located in: `build/chrome/` directory
   
2. **Load Extension in Chrome**
   - Open Chrome browser
   - Navigate to: `chrome://extensions/`
   - Enable "Developer mode" toggle in the top-right corner
   - Click "Load unpacked" button
   - Select the `build/chrome/` folder
   - Extension installed successfully!

### How to Use New Features

#### Feature 1: CTRL+Select Trigger

1. Click the extension icon in the browser toolbar
2. In the popup window, click the gear icon at the top to switch to settings tab
3. Find the "Selection Translation" section
4. Click the "Trigger Mode" dropdown
5. Select "CTRL+Select Trigger"
6. Settings are auto-saved

**Usage:**
- Select text on any webpage
- Hold down the CTRL key on your keyboard (either left or right CTRL)
- Translation popup will automatically appear with the translation

#### Feature 2: Default Translation Tab

- Now when you click the extension icon, it directly shows the translation input box
- No need to manually switch tabs
- You can immediately start typing text to translate

### Technical Details

**Modified Files:**
- `src/config/setting.js` - Added new trigger mode
- `src/config/i18n.js` - Added multilingual translations
- `src/views/Selection/index.js` - Implemented CTRL key detection
- `src/views/Popup/index.js` - Set default tab

**Total Code Changes:**
- 4 files modified
- +16 lines added
- -1 line removed

---

## Build Information

- **Version:** 2.0.17
- **Build Size:** ~3.7MB (uncompressed)
- **Includes:** All locales (en, zh_CN, zh_TW, ja, ko, es, fr, de)
- **Compatible with:** Chrome, Edge, and other Chromium-based browsers

## Troubleshooting

### 扩展无法加载 / Extension Won't Load
- 确保选择了正确的文件夹（`build/chrome/`）
- Make sure you selected the correct folder (`build/chrome/`)
- 检查开发者模式是否已启用
- Check if Developer mode is enabled

### CTRL 触发不工作 / CTRL Trigger Not Working
- 确认在设置中已选择"CTRL+选中触发"模式
- Confirm you selected "CTRL+Select Trigger" mode in settings
- 尝试刷新网页后再试
- Try refreshing the webpage

### 其他问题 / Other Issues
- 查看 `FORK_CHANGES.md` 了解详细技术信息
- See `FORK_CHANGES.md` for detailed technical information
- 查看 `README_FORK_CN.md` 了解完整功能说明
- See `README_FORK_CN.md` for complete feature documentation
