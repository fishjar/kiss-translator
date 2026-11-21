import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import PopupStylePreview from "./PopupStylePreview";
import { compileCss, sanitizeScopeSlug } from "../../libs/compileCss";
import { STYLE_SOURCE_CUSTOM } from "../../hooks/CustomStyles";

// 译文样式下拉选项的共享预览构建（Options 与 Popup 弹窗共用单一实现）。
// 名称左 + 样式预览右的行内两栏。custom 项的原始 styleCode 禁止未经校验
// 直进 emotion（"&, body" 类选择器列表会泄漏全局规则），必须先经
// compileCss 作用域编译与校验（与 StylesSetting 卡片演示同口径），校验
// 失败回退无样式纯文本并显式提示。
// 预览编译结果有界缓存：键 = scopeClass + \u0000 + styleCode（键即全部
// 输入，无失效难题），容量上限 100、FIFO 淘汰。每次渲染对全部 custom 项
// 重跑 compileCss 的开销由此吸收；invalid 判定同样被缓存——键变化即重编，
// 语义与直连编译一致。导出供测试锁定命中/淘汰语义。
export const PREVIEW_COMPILE_CACHE_LIMIT = 100;
export const previewCompileCache = new Map();
export function cachedCompileCss(scopeClass, styleCode) {
  // 非字符串 styleCode（导入可达，StylesSetting 同口径注释）不构造缓存键：
  // 模板串会把数字 123 与字符串 "123" 折叠成同键——invalid 与 valid 的编译
  // 结果在缓存中错配。非字符串直连 compileCss（内部判 invalid）、不读写缓存
  if (typeof styleCode !== "string") {
    return compileCss(scopeClass, styleCode);
  }
  const key = `${scopeClass}\u0000${styleCode}`;
  const cached = previewCompileCache.get(key);
  if (cached) return cached;
  const result = compileCss(scopeClass, styleCode);
  previewCompileCache.set(key, result);
  if (previewCompileCache.size > PREVIEW_COMPILE_CACHE_LIMIT) {
    previewCompileCache.delete(previewCompileCache.keys().next().value);
  }
  return result;
}

function stylePreviewContent(item) {
  const isCustom = item.source === STYLE_SOURCE_CUSTOM;
  const scopeClass = `kt-scope-${sanitizeScopeSlug(item.styleSlug)}`;
  const compiled = isCustom
    ? cachedCompileCss(scopeClass, item.styleCode)
    : null;
  return { isCustom, scopeClass, compiled };
}

// 预览区公共结构：aria-hidden（预览及其 translated_text 不进可访问名
// 称，朗读只保留样式名）+ contain:paint 沙箱（预览根 span 直接承载用户
// styleCode（含 position:fixed/inset/z-index 类危险声明），裸挂会把预览
// 撑成视口覆盖层——外层 contain:paint 使其成为 fixed 后代包含块并裁剪
// 越缘，与 StylesSetting .kt-style-card__demo 沙箱同口径）
// 装饰带预算：minHeight 32px 容得下居中行盒 16px + 下划装饰下探实测
// （underline offset 3.9px、厚度至 2px、波浪余量 2.5px 估算），32px 时
// 最紧行余量 2.6px；共享消费点注记：src/views/Options/Rules.js 与
// Popup 弹窗共用同一预览组件，minHeight:32 同步作用于 Options 样式库演示
// 预览，属有意共享行为
function stylePreviewBox(scopeClass, isCustom, compiled, item, i18n) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      className={isCustom ? scopeClass : undefined}
      sx={{
        // inline-flex 而非默认 inline：contain:paint 对 inline 盒不生效，
        // 无 flex 语境的宿主（弹窗入口）会失去绘制沙箱，样式声明裸奔
        display: "inline-flex",
        alignItems: "center",
        contain: "paint",
        minWidth: 0,
        flexShrink: 0,
        maxWidth: "45%",
        minHeight: 32,
      }}
    >
      {isCustom ? (
        <>
          {compiled.valid && <style>{compiled.css}</style>}
          {/* 编译失败项渲染显式"无法预览"提示而非普通文本演示——避免
              用户把无样式文本误认成样式的真实效果 */}
          <span className={compiled.valid ? "kt-style-demo" : undefined}>
            {i18n(compiled.valid ? "translated_text" : "css_invalid")}
          </span>
        </>
      ) : (
        <PopupStylePreview
          styleSlug={item.styleSlug}
          previewCode={item.styleCode}
          label={i18n("translated_text")}
        />
      )}
    </Box>
  );
}

export function textStyleOptionLabel(item, i18n) {
  const { isCustom, scopeClass, compiled } = stylePreviewContent(item);
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        minWidth: 0,
        width: "100%",
      }}
    >
      <Typography
        component="span"
        sx={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.styleName}
      </Typography>
      {stylePreviewBox(scopeClass, isCustom, compiled, item, i18n)}
    </Box>
  );
}

// 入口预览：仅渲染预览部分（不渲染名称 Typography），供弹窗触发框显示
// 当前样式的"译文"预览——预览自描述，完整名称呈现在菜单行内
export function textStyleEntryPreview(item, i18n) {
  const { isCustom, scopeClass, compiled } = stylePreviewContent(item);
  return stylePreviewBox(scopeClass, isCustom, compiled, item, i18n);
}
