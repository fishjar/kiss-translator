import { useState, useEffect, useMemo, useCallback } from "react";
import Stack from "@mui/material/Stack";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Snackbar from "@mui/material/Snackbar";
import MuiAlert from "@mui/material/Alert";
import { sendBgMsg, sendTabMsg, getCurTab } from "../../libs/msg";
import { isExt } from "../../libs/client";
import { useI18n } from "../../hooks/I18n";
import TextField from "@mui/material/TextField";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_PUTRULE,
  MSG_SAVE_RULE,
  MSG_COMMAND_SHORTCUTS,
  MSG_TRANSBOX_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
} from "../../config";
import { saveRule } from "../../libs/rules";
import { tryClearCaches } from "../../libs/cache";
import { kissLog } from "../../libs/log";
import { getDomainOptions, truncateMiddle } from "../../libs/url";
import { useAllTextStyles } from "../../hooks/CustomStyles";
import { isInBlacklist } from "../../libs/blacklist";
import { useSetting } from "../../hooks/Setting";

/**
 * Popup 弹窗内容主组件
 *
 * @param {Object} props
 * @param {Object} props.rule - 当前网页的翻译规则（包含启用状态、源/目标语言、样式、各种开关）
 * @param {Object} props.setting - 全局通用设置（包含快捷键、API服务列表、划词/悬浮翻译等配置）
 * @param {Function} props.setRule - 更新当前网页规则状态的 React setter
 * @param {Function} props.setSetting - 更新全局设置状态的 React setter
 * @param {Function} props.handleOpenSetting - 打开配置中心页面的回调函数
 * @param {Function} [props.processActions] - 自定义动作处理器（若在非标准扩展环境，如 Shadow DOM 内部运行）
 * @param {boolean} [props.isContent=false] - 标识是否直接运行在页面 Content Script 上（如油猴脚本环境）
 */
export default function PopupCont({
  rule,
  setting,
  setRule,
  setSetting,
  handleOpenSetting,
  processActions,
  isContent = false,
}) {
  const i18n = useI18n();
  // 使用全局 Context 中的 Settings
  const { setting: contextSetting, updateSetting } = useSetting();
  // 注册的快捷键指令映射表
  const [commands, setCommands] = useState({});
  // 当前网址提取出来的多级域名候选项（例如 ["google.com", "mail.google.com"]）
  const [domainOptions, setDomainOptions] = useState([]);
  // 当前选中的目标域名规则应用范围
  const [selectedDomain, setSelectedDomain] = useState("");
  // 全局轻量提示条提示状态
  const [snackbar, setSnackbar] = useState({ open: false, message: "" });
  // 可用的译文显示样式列表
  const { allTextStyles } = useAllTextStyles();

  // 当前网页的完整 URL 地址
  const [currentHref, setCurrentHref] = useState("");

  // 从全局配置中读取黑名单字符串数据（多域名用换行或逗号分隔）
  const blacklistValue = contextSetting?.blacklist || "";

  // 计算当前域名是否已经在黑名单中
  const isInCurrentBlacklist = useMemo(() => {
    if (!selectedDomain || !blacklistValue) return false;
    return isInBlacklist(currentHref, blacklistValue);
  }, [selectedDomain, blacklistValue, currentHref]);

  // 将当前选中域名加入黑名单的逻辑
  const handleAddToBlacklist = useCallback(() => {
    if (!selectedDomain) return;
    const newBlacklist = blacklistValue
      ? `${blacklistValue}\n${selectedDomain}`
      : selectedDomain;
    updateSetting((pre) => ({ ...pre, blacklist: newBlacklist }));
    setSnackbar({
      open: true,
      message: `${i18n("add_to_blacklist")}: ${selectedDomain}`,
    });
  }, [selectedDomain, blacklistValue, updateSetting, i18n]);

  // 将当前选中域名从黑名单中移除的逻辑
  const handleRemoveFromBlacklist = useCallback(() => {
    if (!selectedDomain) return;
    const newList = blacklistValue
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter((url) => url !== selectedDomain)
      .join("\n");
    updateSetting((pre) => ({ ...pre, blacklist: newList }));
    setSnackbar({
      open: true,
      message: `${i18n("remove_from_blacklist")}: ${selectedDomain}`,
    });
  }, [selectedDomain, blacklistValue, updateSetting, i18n]);

  // 切换“网页双语翻译”开启/关闭状态
  const handleTransToggle = async (e) => {
    try {
      setRule({ ...rule, transOpen: e.target.checked ? "true" : "false" });

      if (!processActions) {
        await sendTabMsg(MSG_TRANS_TOGGLE);
      } else {
        processActions({ action: MSG_TRANS_TOGGLE });
      }
    } catch (err) {
      kissLog("toggle trans", err);
    }
  };

  // 切换“划词翻译框”的开启/关闭状态
  const handleTransboxToggle = async (e) => {
    try {
      // REVIEW: 如果 setting 未加载完毕而为 null（虽有外层拦截，但由于 React 渲染时序仍有可能），pre.tranboxSetting 会抛出 TypeError。建议此处及后续 Toggle 添加安全校验保护，如 pre?.tranboxSetting
      setSetting((pre) => ({
        ...pre,
        tranboxSetting: { ...pre.tranboxSetting, transOpen: e.target.checked },
      }));

      if (!processActions) {
        await sendTabMsg(MSG_TRANSBOX_TOGGLE);
      } else {
        processActions({ action: MSG_TRANSBOX_TOGGLE });
      }
    } catch (err) {
      kissLog("toggle transbox", err);
    }
  };

  // 切换“鼠标悬停翻译”的开启/关闭状态
  const handleMousehoverToggle = async (e) => {
    try {
      setSetting((pre) => ({
        ...pre,
        mouseHoverSetting: {
          ...pre.mouseHoverSetting,
          useMouseHover: e.target.checked,
        },
      }));

      if (!processActions) {
        await sendTabMsg(MSG_MOUSEHOVER_TOGGLE);
      } else {
        processActions({ action: MSG_MOUSEHOVER_TOGGLE });
      }
    } catch (err) {
      kissLog("toggle mousehover", err);
    }
  };

  // 切换“输入框快捷翻译”的开启/关闭状态
  const handleInputTransToggle = async (e) => {
    try {
      setSetting((pre) => ({
        ...pre,
        inputRule: {
          ...pre.inputRule,
          transOpen: e.target.checked,
        },
      }));

      if (!processActions) {
        await sendTabMsg(MSG_TRANSINPUT_TOGGLE);
      } else {
        processActions({ action: MSG_TRANSINPUT_TOGGLE });
      }
    } catch (err) {
      kissLog("toggle inputtrans", err);
    }
  };

  // 统一处理翻译规则通用设置项的更新（如自动扫描、扫描全部节点、保留排版、仅显示译文等）
  const handleChange = async (e) => {
    try {
      let { name, value, checked } = e.target;
      // 针对 isPlainText 开关，以布尔值 checked 作为其配置值
      if (name === "isPlainText") {
        value = checked;
      }
      // REVIEW: 项目中对于布尔开关的处理不统一。autoScan、scanAll、hasRichText、transOnly 在 Switch 中传递的是字符串 "true" / "false"（直接修改为 value = checked ? "true" : "false" 会更为干净），而 isPlainText 传递的是原生的布尔值 checked，这在后端规则合并与序列化时易产生数据类型不匹配的问题。
      setRule((pre) => ({ ...pre, [name]: value }));

      if (!processActions) {
        await sendTabMsg(MSG_TRANS_PUTRULE, { [name]: value });
      } else {
        processActions({ action: MSG_TRANS_PUTRULE, args: { [name]: value } });
      }
    } catch (err) {
      kissLog("update rule", err);
    }
  };

  // 手动清除本地的网页翻译缓存数据
  const handleClearCache = () => {
    tryClearCaches();
  };

  // 保存当前网页的域名翻译规则到配置存储中
  const handleSaveRule = async () => {
    try {
      if (!selectedDomain) {
        return;
      }

      const curRule = { ...rule, pattern: selectedDomain };
      if (isExt && isContent) {
        // 如果是扩展内容脚本，需要向 Background 消息管道请求保存规则
        sendBgMsg(MSG_SAVE_RULE, curRule);
      } else {
        // 否则直接本地调用同步方法保存
        saveRule(curRule);
      }
      setSnackbar({
        open: true,
        message: `${i18n("save_rule")}: ${selectedDomain}`,
      });
    } catch (err) {
      kissLog("save rule", err);
    }
  };

  // 挂载/初始化：根据当前页面环境获取完整的 URL 链接，并生成域名选择项
  useEffect(() => {
    (async () => {
      try {
        let href = "";
        if (!isContent) {
          // 运行在扩展的 Popup 浮窗环境，需要异步获取当前激活 Tab 的 URL
          // REVIEW: 针对空白标签页、浏览器内置页面（如 chrome://）或权限受限页面，getCurTab() 返回的 tab 可能为 undefined 或 tab.url 不存在，虽然外层有 try-catch 保护，但建议添加安全性拦截保障稳定性。
          const tab = await getCurTab();
          href = tab?.url || "";
        } else {
          // 运行在主页面 Content Script（油猴脚本）环境，直接读取 window.location.href
          href = window.location?.href;
        }

        if (href && typeof href === "string") {
          setCurrentHref(href);
          const options = getDomainOptions(href);
          setDomainOptions(options);
          if (options.length > 0) {
            setSelectedDomain(options[0]);
          }
        }
      } catch (err) {
        kissLog("get domain options", err);
      }
    })();
  }, [isContent]);

  // 监听全局快捷键配置变更，将其转为前端显示的文本字符串形式（如 "Alt+T"）
  useEffect(() => {
    (async () => {
      try {
        const commands = {};
        if (isExt) {
          // 扩展环境：向后台 Background 发送消息查询系统级绑定的快捷键
          const res = await sendBgMsg(MSG_COMMAND_SHORTCUTS);
          res.forEach(({ name, shortcut }) => {
            commands[name] = shortcut;
          });
        } else {
          // 油猴脚本等非扩展环境：从传入的全局 settings.shortcuts 中读取并格式化
          const shortcuts = setting?.shortcuts;
          if (shortcuts) {
            Object.entries(shortcuts).forEach(([key, val]) => {
              commands[key] = val.join("+");
            });
          }
        }
        setCommands(commands);
      } catch (err) {
        kissLog("query cmds", err);
      }
    })();
  }, [setting?.shortcuts]);

  // 过滤并根据排序权重对当前所有可用的翻译 API 服务进行排序，生成供下拉菜单展示的 API 列表
  const optApis = useMemo(
    () =>
      (setting?.transApis || [])
        .filter((api) => !api.isDisabled)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((api) => ({
          key: api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [setting?.transApis]
  );

  // 快捷提取各种交互开关的当前启用状态
  const tranboxEnabled = setting?.tranboxSetting?.transOpen;
  const mouseHoverEnabled = setting?.mouseHoverSetting?.useMouseHover;
  const inputTransEnabled = setting?.inputRule?.transOpen;

  const {
    transOpen,
    apiSlug,
    fromLang,
    toLang,
    textStyle,
    autoScan,
    transOnly,
    hasRichText,
    scanAll,
    isPlainText = false,
  } = rule || {};

  return (
    <Stack sx={{ p: 2 }} spacing={2}>
      {/* 翻译功能及高级开关的网格布局布局 */}
      <Grid container columns={12} spacing={1}>
        {/* 开关：双语网页翻译 (支持快捷键提示) */}
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Switch
                checked={transOpen === "true"}
                onChange={handleTransToggle}
              />
            }
            label={
              commands["toggleTranslate"]
                ? `${i18n("translate_alt")}(${commands["toggleTranslate"]})`
                : i18n("translate_alt")
            }
          />
        </Grid>
        {/* 开关：网页加载后自动扫描翻译 */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="autoScan"
                value={autoScan === "true" ? "false" : "true"}
                checked={autoScan === "true"}
                onChange={handleChange}
              />
            }
            label={i18n("autoscan_alt")}
          />
        </Grid>
        {/* 开关：扫描翻译所有 DOM 节点，包括隐藏元素等 */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="scanAll"
                value={scanAll === "true" ? "false" : "true"}
                checked={scanAll === "true"}
                onChange={handleChange}
              />
            }
            label={i18n("scan_all_nodes")}
          />
        </Grid>
        {/* 开关：保留排版/富文本翻译 (识别加粗、链接等格式) */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="hasRichText"
                value={hasRichText === "true" ? "false" : "true"}
                checked={hasRichText === "true"}
                onChange={handleChange}
              />
            }
            label={i18n("richtext_alt")}
          />
        </Grid>
        {/* 开关：仅显示译文 (不保留原文) */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="transOnly"
                value={transOnly === "true" ? "false" : "true"}
                checked={transOnly === "true"}
                onChange={handleChange}
              />
            }
            label={i18n("transonly_alt")}
          />
        </Grid>
        {/* 开关：开启页面划词翻译框 */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="tranboxEnabled"
                value={!tranboxEnabled}
                checked={tranboxEnabled}
                onChange={handleTransboxToggle}
              />
            }
            label={i18n("selection_translate")}
          />
        </Grid>
        {/* 开关：开启鼠标悬浮翻译 */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="mouseHoverEnabled"
                value={!mouseHoverEnabled}
                checked={mouseHoverEnabled}
                onChange={handleMousehoverToggle}
              />
            }
            label={i18n("mousehover_translate")}
          />
        </Grid>
        {/* 开关：开启输入框快捷翻译 */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="inputTransEnabled"
                value={!inputTransEnabled}
                checked={inputTransEnabled}
                onChange={handleInputTransToggle}
              />
            }
            label={i18n("input_translate")}
          />
        </Grid>
        {/* 开关：纯文本扫描翻译模式 (更高性能，但不支持排版保留) */}
        <Grid item xs={6}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                name="isPlainText"
                value={!isPlainText}
                checked={isPlainText}
                onChange={handleChange}
              />
            }
            label={i18n("plain_text_translate")}
          />
        </Grid>
      </Grid>

      {/* 源语言与目标语言选择下拉菜单 */}
      <Stack direction="row" spacing={2}>
        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={fromLang}
          name="fromLang"
          label={i18n("from_lang")}
          onChange={handleChange}
          fullWidth
        >
          {OPT_LANGS_FROM.map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>
              {name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={toLang}
          name="toLang"
          label={i18n("to_lang")}
          onChange={handleChange}
          fullWidth
        >
          {OPT_LANGS_TO.map(([lang, name]) => (
            <MenuItem key={lang} value={lang}>
              {name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {/* 翻译引擎服务商与译文排版样式选择 */}
      <Stack direction="row" spacing={2}>
        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={apiSlug}
          name="apiSlug"
          label={i18n("translate_service")}
          onChange={handleChange}
          fullWidth
        >
          {optApis.map(({ key, name }) => (
            <MenuItem key={key} value={key}>
              {name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={textStyle}
          name="textStyle"
          label={
            commands["toggleStyle"]
              ? `${i18n("text_style_alt")}(${commands["toggleStyle"]})`
              : i18n("text_style_alt")
          }
          onChange={handleChange}
          fullWidth
        >
          {allTextStyles.map((item) => (
            <MenuItem key={item.styleSlug} value={item.styleSlug}>
              {item.styleName}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {/* 域名规则设置与黑名单配置 */}
      <Stack>
        {/* 作用域名选择下拉列表（包含整站、特定子域名等选择项） */}
        <TextField
          select
          SelectProps={{ MenuProps: { disablePortal: true } }}
          size="small"
          value={selectedDomain}
          label={i18n("domain")}
          onChange={(e) => setSelectedDomain(e.target.value)}
          fullWidth
          sx={{ mb: 1 }}
        >
          {domainOptions.map((domain) => (
            <MenuItem key={domain} value={domain} title={domain}>
              {truncateMiddle(domain)}
            </MenuItem>
          ))}
        </TextField>
        {/* 规则相关的操作按钮：保存、黑名单操作、清理缓存 */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Button
            variant="text"
            onClick={handleSaveRule}
            disabled={domainOptions.length === 0}
          >
            {i18n("save_rule")}
          </Button>
          <Button
            variant="text"
            onClick={
              isInCurrentBlacklist
                ? handleRemoveFromBlacklist
                : handleAddToBlacklist
            }
            disabled={domainOptions.length === 0}
          >
            {i18n(
              isInCurrentBlacklist
                ? "remove_from_blacklist"
                : "add_to_blacklist"
            )}
          </Button>
          <Button variant="text" onClick={handleClearCache}>
            {i18n("clear_cache")}
          </Button>
        </Stack>
        {/* 底部导航支持及通用设置入口 */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Button
            variant="text"
            onClick={() => {
              window.open(
                "https://chromewebstore.google.com/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof/reviews",
                "_blank"
              );
            }}
          >
            {i18n("comment_support")}
          </Button>
          <Button
            variant="text"
            onClick={() => {
              window.open(
                "https://github.com/fishjar/kiss-translator#%E8%B5%9E%E8%B5%8F",
                "_blank"
              );
            }}
          >
            {i18n("appreciate_support")}
          </Button>
          <Button variant="text" onClick={handleOpenSetting}>
            {i18n("setting")}
          </Button>
        </Stack>
      </Stack>
      {/* 操作成功提示气泡提示条 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <MuiAlert
          onClose={() => setSnackbar({ open: false, message: "" })}
          severity="success"
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>
    </Stack>
  );
}
