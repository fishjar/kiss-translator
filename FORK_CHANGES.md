# Fork Changes

This fork adds two new features to KISS Translator:

## Features Added

### 1. CTRL+Select Trigger Mode (CTRL+选中触发)

A new trigger mode has been added that allows translation to be triggered when:
- Text is selected AND
- The CTRL key is held down

This trigger mode can be selected in the extension settings under "划词翻译" (Selection Translation) → "触发方式" (Trigger Mode).

**Implementation Details:**
- New constant `OPT_TRANBOX_TRIGGER_CTRL_SELECT` added to `src/config/setting.js`
- Added to available trigger modes array `OPT_TRANBOX_TRIGGER_ALL`
- i18n translations added for all supported languages
- Mouseup event handler updated to check for `e.ctrlKey` when in CTRL+Select mode

### 2. Default Popup to Translation Tab (默认显示翻译标签页)

When clicking the extension icon in the toolbar, the popup now defaults to showing the translation tab instead of the settings tab.

**Implementation Details:**
- Changed initial state of `showTrantab` from `false` to `true` in `src/views/Popup/index.js`

## Installation Instructions

### Loading the Extension in Chrome

1. Download the `kiss-translator-chrome-v2.0.17-ctrl-trigger.zip` file
2. Extract the zip file to a folder on your computer
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" using the toggle in the top-right corner
5. Click "Load unpacked" button
6. Select the extracted `chrome` folder
7. The extension should now be installed and active

### Using the CTRL+Select Trigger

1. Click on the extension icon to open settings
2. Navigate to the "Selection Translation" settings
3. Find the "Trigger Mode" dropdown
4. Select "CTRL+选中触发" (CTRL+Select Trigger)
5. Save the settings
6. Now, when you select text on any webpage while holding the CTRL key, the translation will appear automatically

## Building from Source

To build the extension from source:

```bash
# Install dependencies
pnpm install

# Build Chrome extension
unset CI && pnpm build:chrome

# The built extension will be in the build/chrome/ directory
```

## Minimal Changes Philosophy

These changes were designed to be minimal and focused:
- Only 4 files modified
- No changes to core translation logic
- Easy to merge with upstream updates
- Clean separation of new features

## Modified Files

1. `src/config/setting.js` - Added new trigger mode constant
2. `src/config/i18n.js` - Added translations for new trigger mode
3. `src/views/Selection/index.js` - Added CTRL key detection logic
4. `src/views/Popup/index.js` - Changed default tab to translation
