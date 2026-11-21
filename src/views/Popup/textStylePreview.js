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
// 输入，无失效难题），容量上限 100、LRU 淘汰（命中重插表尾刷新最近使用
// 权——固定插入序淘汰会让活跃工作集在逐出轮替中整轮 miss，第 2 轮起
// 0% 命中、每次渲染全量重编）。每次渲染对全部 custom 项重跑 compileCss
// 的开销由此吸收；invalid 判定同样被缓存——键变化即重编，语义与直连编
// 译一致。导出供测试锁定命中/淘汰语义。
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
  if (cached) {
    previewCompileCache.delete(key);
    previewCompileCache.set(key, cached);
    return cached;
  }
  const result = compileCss(scopeClass, styleCode);
  const safe = { ...result, css: sanitizePreviewCss(result.css) };
  previewCompileCache.set(key, safe);
  if (previewCompileCache.size > PREVIEW_COMPILE_CACHE_LIMIT) {
    previewCompileCache.delete(previewCompileCache.keys().next().value);
  }
  return safe;
}

// 预览口径远程引用清洗：反斜杠转义还原识别 + http(s)/协议相对 url 置 none，
// 本地落地以免把 epub 模块（dompurify/epubParser）依赖拖进弹窗与 Options
// 共享包。仅作用于预览注入面：预览宿主对每个未选中 custom 项都真实渲染
// <style>，远程图片/字体引用会在打开下拉时逐项发起第三方请求（ip/referer
// 泄露、跟踪像素可落页内）；data:/相对路径不发起远程请求，原样保留。
// compileCss 的 url 透传契约与生产渲染路径不受影响。
// 按括号配对与字符串边界递归遍历，而非整串函数名匹配：①嵌套资源函数
// （image-set(url(...))、image-set("..." 1x)）的内层 url 与裸串 URL 同口径
// 阻断——朴素正则会把外层 image-set 当函数、[^)] 吞掉首个右括号致内层
// url 漏判；②引号内是字面文本不是资源引用，content:"url(...)" 不得被改写；
// ③转义函数名（\75 rl( 解码即 url(）经解码后同策略识别。
const CSS_ESCAPE_RE =
  /\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|([\r\n\f]|\r\n)|(.))/g;
const CSS_WS_RE = /[ \t\r\n\f]/;
const REMOTE_URL_RE = /^(?:https?:)?\/\//i;
// 资源列表函数：逗号分层成员既可写 url(...) 也可写裸字符串 URL
const IMAGE_SET_FN_RE = /^(?:-webkit-)?image-set$/;

function cssUnescapeLocal(str) {
  if (!str || typeof str !== "string" || !str.includes("\\")) return str;
  return str.replace(CSS_ESCAPE_RE, (_, hex, newline, char) => {
    if (hex) {
      const cp = parseInt(hex, 16);
      if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) {
        return "\uFFFD";
      }
      return String.fromCodePoint(cp);
    }
    if (newline) {
      return "";
    }
    return char;
  });
}

// url()/裸串实参是否为远程引用：去引号、反转义后核前缀
function isRemoteReferenceArg(arg) {
  const unquoted = arg
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
  return REMOTE_URL_RE.test(cssUnescapeLocal(unquoted).trim());
}

// 引号串结束后的下标（含闭引号）；转义不闭串；未闭合返 -1
function scanStringEnd(text, start) {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return -1;
}

// 从 openIdx（'(' 处）找配对右括号：字符串与转义整体跳过，嵌套计数；
// 未闭合返 -1（交调用方原样透传）
function matchCloseParen(text, openIdx) {
  let depth = 0;
  let i = openIdx;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = scanStringEnd(text, i);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

// 读一个 CSS 标识符（含 \hex+单个尾空、\单字符 转义），返回 [name, end]。
// 转义尾空属转义体一部分须一并消费，使 \75 rl 与 url 解码同形
function readIdent(text, start) {
  let name = "";
  let j = start;
  while (j < text.length) {
    const ch = text[j];
    if (ch === "\\") {
      const hexMatch = /^[0-9a-fA-F]{1,6}/.exec(text.slice(j + 1, j + 8));
      if (hexMatch) {
        let end = j + 1 + hexMatch[0].length;
        if (end < text.length && CSS_WS_RE.test(text[end])) end += 1;
        name += text.slice(j, end);
        j = end;
        continue;
      }
      name += ch + (text[j + 1] ?? "");
      j += 2;
      continue;
    }
    if (!/[a-zA-Z0-9_\u0080-\uffff-]/.test(ch)) break;
    name += ch;
    j += 1;
  }
  return [name, j];
}

// 仅替换参数列表中作为裸串的远程引用为 none（url() 已由递归先行处理）
function scrubImageSetStringArgs(args) {
  let out = "";
  let i = 0;
  while (i < args.length) {
    const ch = args[i];
    if (ch === '"' || ch === "'") {
      const end = scanStringEnd(args, i);
      if (end === -1) {
        out += args.slice(i);
        break;
      }
      const strToken = args.slice(i, end);
      out += isRemoteReferenceArg(strToken) ? "none" : strToken;
      i = end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// 字符串感知、括号配对递归的 CSS 值扫描清洗器。嵌套深度上限：合法 CSS 值
// 的函数嵌套远不及此，超限即整段原样透传（fail-closed＝不清洗，与未识别
// 形态同口径），杜绝病态深嵌套 styleCode 触发递归栈溢出崩渲染。
const MAX_SANITIZE_DEPTH = 32;
function sanitizeCssValue(text, depth = 0) {
  if (depth > MAX_SANITIZE_DEPTH) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // 字符串字面量整段原样保留：其中 url(...) 是字面文本非资源引用
    if (ch === '"' || ch === "'") {
      const end = scanStringEnd(text, i);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (/[a-zA-Z_\\-]/.test(ch)) {
      const [name, afterName] = readIdent(text, i);
      if (name) {
        // 函数 token 须 ident 紧邻 '('：CSS 词法中两者之间的空白会断开
        // 函数语义（媒体特性块 and (…)、@supports (…) 均靠该空白分隔）。
        // 仅紧邻才进函数分支，否则按普通 ident 透传并保留空白——折叠空白
        // 会把 @media … and (min-width:…) 变成 and(…)、整条 at-rule 被
        // 浏览器按未知函数丢弃，预览静默失效而生产路径不受影响
        if (text[afterName] === "(") {
          const close = matchCloseParen(text, afterName);
          if (close !== -1) {
            const origArgs = text.slice(afterName + 1, close);
            const lname = cssUnescapeLocal(name).toLowerCase();
            if (lname === "url") {
              out += isRemoteReferenceArg(origArgs)
                ? "none"
                : `${name}(${origArgs})`;
            } else if (IMAGE_SET_FN_RE.test(lname)) {
              const cleanedArgs = scrubImageSetStringArgs(
                sanitizeCssValue(origArgs, depth + 1)
              );
              out += `${name}(${cleanedArgs})`;
            } else {
              out += `${name}(${sanitizeCssValue(origArgs, depth + 1)})`;
            }
            i = close + 1;
            continue;
          }
        }
        out += name;
        i = afterName;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

function sanitizePreviewCss(css) {
  if (!css || typeof css !== "string") {
    return css;
  }
  return sanitizeCssValue(css);
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
// 装饰带预算：块轴固定 32px 容得下居中行盒 16px + 下划装饰下探实测
// （underline offset 3.9px、厚度至 2px、波浪余量 2.5px 估算），32px 时
// 最紧行余量 2.6px。块轴固定而非最小值：用户 CSS 的 line-height/font-size
// 不得撑高预览盒进而撑爆 48px 菜单行或入口触发框，越缘内容由 contain
// paint 裁剪；共享消费点注记：src/views/Options/Rules.js 与
// Popup 弹窗共用同一预览组件，32px 固定块轴同步作用于 Options 样式库演示
// 预览，属有意共享行为
function stylePreviewBox(
  scopeClass,
  isCustom,
  compiled,
  item,
  i18n,
  maxWidth = "45%",
  hintId
) {
  // 编译失败项：错误提示原位替换演示盒——提示允许换行（窄菜单行不压样
  // 式名至不可见），位于 aria-hidden 之外读屏可达；演示盒不渲染，无样式
  // 文本不会被误认成样式的真实效果
  if (isCustom && !compiled.valid) {
    return (
      <Typography
        component="span"
        id={hintId}
        className="kt-style-preview-hint"
        sx={{ minWidth: 0 }}
      >
        {i18n(
          compiled.reason === "unsupported" ? "css_unsupported" : "css_invalid"
        )}
      </Typography>
    );
  }
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
        // 装饰带让位：text-shadow/box-shadow 横向出血经 padding 2px 6px +
        // margin -2px -6px 负让位带承载（与样式卡 .kt-style-card__demo 同
        // 口径）——contain:paint 以内容宽缘为裁切边，无让位带时内置辉光
        // 阴影横缘被切断，同一 styleCode 卡内与预览两貌漂移
        padding: "2px 6px",
        margin: "-2px -6px",
        // 缺省 45%＝option 双栏（名称左+预览右）的让位口径；入口预览
        // （无名称栏同框）由调用方放全宽
        maxWidth,
        height: 32,
      }}
    >
      {isCustom ? (
        <>
          <style>{compiled.css}</style>
          <span className="kt-style-demo">{i18n("translated_text")}</span>
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
export function textStyleEntryPreview(item, i18n, hintId) {
  const { isCustom, scopeClass, compiled } = stylePreviewContent(item);
  // 入口预览是唯一内容（无名称栏同框）：放全宽，45% 让位口径仅属双栏行
  return stylePreviewBox(
    scopeClass,
    isCustom,
    compiled,
    item,
    i18n,
    "100%",
    hintId
  );
}

// 入口可及描述判定：活动 custom 样式编译失败时返回提示文案键——触发
// 按钮以 aria-describedby 关联失败状态，读屏可感知（aria-label 只有样式
// 名，可见提示文本不进可及名计算）
export function textStylePreviewStatus(item) {
  const { isCustom, compiled } = stylePreviewContent(item);
  if (!isCustom || compiled.valid) return null;
  return compiled.reason === "unsupported" ? "css_unsupported" : "css_invalid";
}
