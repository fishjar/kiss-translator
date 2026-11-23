// 安全 CSS 编译解析器：把用户草稿按卡片作用域编译（& 嵌套展开为作用域
// 后代选择器）；括号不配对等语法无效 → { css: "", valid: false } 优雅
// 降级（is-invalid 形态），绝不抛错崩页面。StylesSetting 卡片演示与
// Rules 下拉的 custom 项预览共用同一校验口径。
// 校验边界契约：只拦两类形态——①浏览器同样拒绝且静默丢弃、用户得不到
// 任何反馈的结构残稿（未闭合括号/字符串/注释、尾组合符、& 与类型选择器
// 直接复合）；②预览作用域策略不接受的结构（选择器列表、伪类函数参数内
// 的 &，判 unsupported 可保存不预览）。词法级残渣（CDO/CDATA、块内
// at-rule、声明值中的非常规 token、纯 NBSP 草稿等）按原文透传交浏览器
// 裁决，不为该层加闸——本契约是校验面的收口线，后续新校验仅限「浏览器
// 静默丢弃且用户无反馈」新形态的等价识别。
// 顶层逗号检测：仅括号深度为 0 的逗号才是选择器列表分隔符。括号内的
// 逗号是函数式伪类参数（":not(.a, .b)" 展开后整体仍挂在作用域前缀下，
// 非逃逸），不判无效。杂散 ")" 经 clamp 不下探负深度；未闭合 "(" 的残稿
// 中逗号按括号内处理（不判顶层）——该场景由预扫描终检（parenDepth 非零
// 整份无效）兜住，本函数只见平衡输入，clamp 仅为防御性兜底。输入为掩码
// 副本，字符串内逗号已置零。
function hasTopLevelComma(sel) {
  let parenDepth = 0;
  for (let i = 0; i < sel.length; i += 1) {
    const ch = sel[i];
    if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (ch === "," && parenDepth === 0) {
      return true;
    }
  }
  return false;
}

// 尾组合符判定：选择器（剥注释占位后）以 > + ~ 收尾即无右操作数的结构级
// 无效——发射形态会被浏览器静默丢弃而 valid 仍放行，用户拿不到任何无效
// 反馈。尾部空白按 CSS 空白集裁剪（U+00A0 非 CSS 空白、属 ident 字符，
// 保留供右操作数判定）；属性串值以引号收尾，不构成组合符结尾。
function hasTrailingCombinator(sel) {
  const trimmed = sel.replace(/\/\*\*\//g, "").replace(/[ \t\n\r\f]+$/, "");
  if (!trimmed) return false;
  const last = trimmed[trimmed.length - 1];
  if (last !== ">" && last !== "+" && last !== "~") return false;
  // 转义感知：末字符前紧跟奇数个反斜杠说明该字符被转义（.tag\+ 是选择器
  // 文本），不构成组合符；偶数个（含 0）则末字符为裸结构字符。
  let backslashes = 0;
  for (let i = trimmed.length - 2; i >= 0 && trimmed[i] === "\\"; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}

// 逐成员尾组合符判定：选择器列表按括号深度感知的顶层逗号拆分后，任一
// 成员以 > + ~ 收尾即整规则被浏览器静默丢弃——整段判定只看列表末字符，
// "& >, body" 形态的成员级死头会漏判。成员边界取掩码副本顶层逗号坐标
//（字符串内逗号已置零、括号内逗号按深度跳过，":not(.a,.b)" 不被误拆），
// 成员文本取 stripped 同位切片交既有 hasTrailingCombinator 评估。
function hasTrailingCombinatorMember(masked, stripped, start, end) {
  let parenDepth = 0;
  let memberStart = start;
  for (let i = start; i < end; i += 1) {
    const ch = masked[i];
    if (ch === "," && parenDepth === 0) {
      if (hasTrailingCombinator(stripped.slice(memberStart, i))) {
        return true;
      }
      memberStart = i + 1;
    } else if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }
  }
  return hasTrailingCombinator(stripped.slice(memberStart, end));
}

// 无效返回统一出口：reason 区分「syntax」＝真语法错误（浏览器同样拒绝）
// 与「unsupported」＝合法 CSS 但预览器作用域策略不接受的结构（选择器列表、
// 函数式伪类参数内的 & 等）——消费点按 reason 选文案，避免把合法结构误
// 报成语法错误。
function invalidCss(reason = "syntax") {
  return { css: "", valid: false, reason };
}

// 字符串外转义对的掩码哨兵：非空白、非任何结构字符——& 的中缀判定向左
// 扫描遇之即停（转义标点是选择器内容，& 据此保留祖先条件），区别于注释/
// 字符串内容的 \u0000 占位（占位与空白同权可越过）。
const ESCAPED_CHAR_MASK = "\u0001";

// 作用域类名 slug 净化：[A-Za-z0-9_-] 逐字符恒等（既有夹具类名
// kt-scope-custom-a 等不受影响），其余字符按码点 uXXXX 编码。编码不提供
// 任意 slug 间的无歧义单射——构造含字面 uXXXX 文本的 slug 可与另一含
// 不安全字符的 slug 编码出同串（如 "::" 与 ":u003a"）；生产 slug 由
// custom_<uuid> 生成、全为安全字符恒等透传，碰撞仅存在于伪造输入，超出
// 预览作用域隔离的威胁模型（防御目标是逗号/空白不得进入选择器生成选择
// 器列表逃逸）。
export function sanitizeScopeSlug(slug) {
  return String(slug).replace(
    /[^A-Za-z0-9_-]/g,
    (ch) => `u${ch.codePointAt(0).toString(16).padStart(4, "0")}`
  );
}

// 判定 & 匹配是否为"选择器中缀 &"（& 前有祖先选择器文本，如
// "html.dark &"）：在掩码副本上从 & 位置（index）-1 向左跳过空白与注释/
// 字符串占位（\u0000），先遇 { 或 } 或文本起点 → 规则边界，按顶层规则
// 提取；先遇其他非空白字符 → 中缀 &，不提取（整条随后续切片并入 rest，
// 由原生 CSS 嵌套解析 & = 父选择器，祖先条件保留且永不逃出作用域）。;
// 视为前一条声明结束/新规则开始的边界（与 } 同权）：声明后跟随的 &
//（如 "color: red; &:hover"）是新规则起点，按顶层规则平铺提取。字符串
// 内容置 \u0000 占位可被越过，但字符串两侧引号字符保留在掩码中，扫描
// 遇引号即停（字符串邻接的 & 判中缀，保守安全；字符串内的 ; 不会被
// 越过字符串边界的扫描触及）；注释已置 NUL 占位。字符串外转义对置非
// 空白哨兵（\u0001），扫描遇之即停——转义标点（\* 等）是选择器内容，
// 其后的 & 不得误判顶层起点平铺成无条件规则。
function isMidSelectorAmp(masked, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = masked[i];
    if (
      ch !== " " &&
      ch !== "\t" &&
      ch !== "\n" &&
      ch !== "\r" &&
      ch !== "\f" &&
      ch !== "\u0000"
    ) {
      return ch !== "{" && ch !== "}" && ch !== ";";
    }
  }
  return false;
}

// CSS 空白（url token 起始空白与 bad-url 判定用）
function isCssWs(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

// 两端裁剪只认 CSS 空白集：U+00A0 非 CSS 空白（属 ident 字符），声明值
// 边缘的 NBSP 是值的一部分，不得剥离
export function trimCssWs(s) {
  return s.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "");
}

// 解析 CSS ident（支持 \hex{1,6}+可选空白 与 \单字符 转义并解码）；\ 后接
// 换行/换页或 EOF 属非法转义，返回 null——调用方保守判整份无效。返回
// { value, end }，end 指向 ident 结束索引（不含）。
function parseCssIdent(raw, i) {
  let value = "";
  let j = i;
  while (j < raw.length) {
    const c = raw[j];
    if (/[A-Za-z0-9_\u0080-\uffff-]/.test(c)) {
      value += c;
      j += 1;
      continue;
    }
    if (c === "\\") {
      const hexMatch = /^[0-9a-fA-F]{1,6}/.exec(raw.slice(j + 1, j + 8));
      if (hexMatch) {
        let k = j + 1 + hexMatch[0].length;
        if (raw[k] === "\r" && raw[k + 1] === "\n") k += 2;
        else if (raw[k] && isCssWs(raw[k])) k += 1;
        // 超界/非法码点（0、代理区、>0x10FFFF）不崩：fromCodePoint 对
        // 0x110000 类输入抛 RangeError，统一以 U+FFFD 替代
        const cp = parseInt(hexMatch[0], 16);
        const safeCp =
          cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff
            ? 0xfffd
            : cp;
        value += String.fromCodePoint(safeCp);
        j = k;
        continue;
      }
      const nxt = raw[j + 1];
      // 仅 EOF 或换行类字符致非法转义；\ + 空格/tab 是合法转义（与 url
      // 分支 bad-url 判定同口径）
      if (nxt === undefined || nxt === "\n" || nxt === "\r" || nxt === "\f") {
        return null;
      }
      value += nxt;
      j += 2;
      continue;
    }
    break;
  }
  return { value, end: j };
}

// 函数式伪类括号判定：`(` 左侧紧邻 ident（含转义拼写），解码后属于已知
// 函数式伪类名集合且 ident 前一字元为 `:`（:has( / :is( / :not( /
// :where( / ::part( 等及转义拼写 :i\73(）→ 选择器语境的伪类函数括号。
// 集合判定使命名相似的声明值函数不误判：--tokens:f(&) 的 f 不在集合、
// --x: has(&) 的冒号前为空白，均放行；转义拼写经解码与普通拼写同策略。
const PSEUDO_FN_NAMES = new Set([
  "has",
  "is",
  "not",
  "where",
  "host",
  "host-context",
  "part",
  "slotted",
  "dir",
  "lang",
  "nth-child",
  "nth-last-child",
]);
function isPseudoFnParen(stripped, parenIndex) {
  let j = parenIndex - 1;
  // 反向逐 token 回退：hex 转义的终止空白属转义体（与 parseCssIdent 解码
  // 同口径），须连同转义体一起跳过后继续取 ident——连续转义链（\69 \73）
  // 逐一链式回退，双空白才是真分隔符；普通 ident 字符与反斜杠逐个消费
  while (j >= 0) {
    if (
      isCssWs(stripped[j]) &&
      /\\[0-9a-fA-F]{1,6}$/.test(stripped.slice(0, j))
    ) {
      j -= 1;
      continue;
    }
    if (!/[A-Za-z0-9_\u0080-\uffff\\-]/.test(stripped[j])) break;
    j -= 1;
  }
  if (j === parenIndex - 1) return false;
  if (j < 0 || stripped[j] !== ":") return false;
  const ident = parseCssIdent(stripped, j + 1);
  if (!ident || ident.end !== parenIndex) return false;
  return PSEUDO_FN_NAMES.has(ident.value.toLowerCase());
}

export function compileCss(scopeClass, raw) {
  // 非字符串闸：导入/同步通道可能注入非字符串 styleCode（如 123），
  // raw.trim() 会抛 TypeError 崩页面——非字符串整份判无效，空/纯空白
  // 字符串保持 valid:true 的既有语义。
  if (typeof raw !== "string") return invalidCss();
  // 空草稿判断只认 CSS 空白集：纯 NBSP 等非 CSS 空白内容不是空草稿
  if (!raw || /^[ \t\n\r\f]*$/.test(raw)) return { css: "", valid: true };
  // 预处理单遍扫描：剥注释、跟踪字符串与转义状态，同时做花括号深度计数。
  // 字符串/注释内的花括号不参与深度计数，也不得被 & 规则正则误捕——否则
  // 扫描计数与真实解析器的块结构错位（content: "{" / "}"、/* & x { } */
  // 会造成误判无效或把注释当规则发射）。产出两份等长文本：
  //   stripped — 注释以空注释占位保留（token 分隔；字符串原样保留，输出
  //   拼装基于它）
  //   masked   — 字符串内部字符替换为 \u0000 的掩码副本（& 规则正则在它
  //              上跑，命中索引可直接映射回 stripped 取真实 sel/body）
  // 无法安全处理的输入（注释/字符串未闭合）整份判无效，作用域闸不缺口。
  // 圆括号深度同遍跟踪，并按开启语境记录括号性质：函数式伪类参数内
  //（( 前紧邻 ident 且 ident 前一字元为 :，如 body:has(&)）的结构 & 登
  // 记旗标交末闸统一裁决（此处不早退，预扫描先完成全部结构校验）——
  // 交原生嵌套解析后作用域前缀化语义不可预测，浏览器支持不一且可能
  // 静默失效无预览反馈；声明值/顶层声明内的括号非伪类函数括号，其内
  // & 非结构引用，放行。
  let depth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  // 括号性质栈与 parenDepth 严格镜像：计数增减的每个位点同点入栈/出栈
  const parenFnStack = [];
  // 定界符交叉配对栈：{ ( [ 逐个压栈，闭括号须与栈顶同类，交叉闭合
  // （{ [ } ] / ([)]）即判无效——三独立计数器对交叉形恰好归零会漏判
  const delimStack = [];
  // 伪类函数括号内 & 旗标：预扫描不早退，先完成全部结构校验，末闸统一裁决
  let hasPseudoFnAmp = false;
  // 结构性 & 与花括号位置登记（字符串/注释/url 内容/转义对均被掩码或
  // 消费，不会进入本登记）：平铺提取据此单调遍历，替代逐 & 正则重扫
  const ampPositions = [];
  const braceMarks = [];
  let stripped = "";
  let masked = "";
  let quote = "";
  for (let i = 0; i < raw.length; ) {
    const ch = raw[i];
    if (quote) {
      // 字符串内部：原文保留、掩码置零；转义对（\" 等）整体保留
      if (ch === "\\") {
        // 完整 CSS hex 转义（\26 等）：1-6 位 hex + 可选终止空白（含
        // LF/CRLF 换页）随转义体整体保留——只消费 1 字符会让终止空白残留
        // 命中未转义换行闸，合法 \26 <LF> 形态被整份误判 bad-string
        const hexMatch = /^[0-9a-fA-F]{1,6}/.exec(raw.slice(i + 1, i + 8));
        if (hexMatch) {
          const hexEnd = i + 1 + hexMatch[0].length;
          let end = hexEnd;
          if (raw[end] === "\r" && raw[end + 1] === "\n") end += 2;
          else if (raw[end] && isCssWs(raw[end])) end += 1;
          stripped += raw.slice(i, end);
          masked += "\u0000".repeat(end - i);
          i = end;
          continue;
        }
        stripped += ch;
        masked += "\u0000";
        if (i + 1 < raw.length) {
          stripped += raw[i + 1];
          masked += "\u0000";
          i += 2;
          // CRLF 源文件中 \<CR><LF> 是单个续行 token：转义对已消费 \r，紧随
          // 的 \n 一并按续行保留（基对前进 2 + 追加前进 1，合计 3），否则裸
          // \n 残留命中下方无效闸，CRLF 文件的合法续行被整份误判无效
          if (raw[i - 1] === "\r" && raw[i] === "\n") {
            stripped += raw[i];
            masked += "\u0000";
            i += 1;
          }
        } else {
          i += 1;
        }
        continue;
      }
      stripped += ch;
      masked += "\u0000";
      if (ch === quote) {
        quote = "";
        i += 1;
        continue;
      }
      // CSS 字符串不允许未转义的换行/回车/换页（规范 bad-string token）：
      // 原样保留会发射跨行字符串值的非法 CSS，整份判无效（与未闭合字符串
      // 同口径）。转义续行（\<newline>）已在上方转义对分支整体保留，不受
      // 本闸影响。
      if (ch === "\n" || ch === "\r" || ch === "\f") {
        return invalidCss();
      }
      i += 1;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "*") {
      // 注释按 token 分隔符落位：stripped 保留空注释（/**/）隔断相邻
      // token（整段移除会把 u/*c*/rl(x) 并成 url(x)、&/*c*/x 并成 &x，
      // 预扫描与浏览器 token 化错位）；masked 同位写等长 NUL，维持
      // masked↔stripped 等长索引映射（NUL 非空白，& 判中缀，与字符串
      // 掩码口径一致且保守安全）。未闭合注释仍整份判无效。
      const end = raw.indexOf("*/", i + 2);
      if (end === -1) return invalidCss();
      stripped += "/**/";
      masked += "\u0000\u0000\u0000\u0000";
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      stripped += ch;
      masked += ch;
      i += 1;
      continue;
    }
    // 无引号 url token 识别：紧贴 ( 的 ident 解码后等于 url（大小写不敏感，
    // 转义标识符经解码识别）时，浏览器把 ( 到 ) 之间的内容（含花括号/
    // 分号/&）作为 url/bad-url token 消费——预扫描若按结构性括号计数会与
    // 真实块结构错位（"url({) } body { … }" 的 body 规则会逃逸为顶层规则）。
    // url 内容在掩码副本中置零（对深度计数与 & 规则提取透明），stripped
    // 原样保留；起始空白后遇引号交回字符串状态（带引号 url 由既有字符串
    // 口径掩码）；未转义引号/空白/非法转义 → bad-url，吞至最近 ) 为止；
    // EOF 仍未闭合判无效。
    if (/[A-Za-z0-9_\u0080-\uffff-]/.test(ch) || ch === "\\") {
      const ident = parseCssIdent(raw, i);
      if (ident === null) return invalidCss();
      const isUrlFn =
        raw[ident.end] === "(" && ident.value.toLowerCase() === "url";
      if (isUrlFn) {
        stripped += raw.slice(i, ident.end + 1);
        masked += raw.slice(i, ident.end + 1);
        i = ident.end + 1;
        while (i < raw.length && isCssWs(raw[i])) {
          stripped += raw[i];
          masked += "\u0000";
          i += 1;
        }
        if (raw[i] === '"' || raw[i] === "'") {
          // 带引号 url：交回主循环字符串状态处理。url( 的开括号在此计入
          // parenDepth——闭括号将经默认路径递减，计数须对称（无引号路径
          // 的闭括号由 url 分支直写、不经默认路径，故两侧均不计）。否则
          // body:has(url("a"), &) 类输入的中间态深度提前归零，函数式伪类
          // 参数内的 & 闸（parenDepth > 0）被击穿。
          parenDepth += 1;
          delimStack.push("(");
          // 括号性质栈与计数镜像：同点按同一判据压栈
          parenFnStack.push(isPseudoFnParen(stripped, stripped.length - 1));
          continue;
        }
        let bad = false;
        while (i < raw.length) {
          const c = raw[i];
          if (c === ")") {
            break;
          }
          if (c === "\\") {
            const nxt = raw[i + 1];
            // 仅 EOF 或换行类字符致非法转义；\ + 空格/tab 是合法转义
            if (
              nxt === undefined ||
              nxt === "\n" ||
              nxt === "\r" ||
              nxt === "\f"
            ) {
              bad = true;
              break;
            }
            stripped += c + nxt;
            masked += "\u0000\u0000";
            i += 2;
            continue;
          }
          if (isCssWs(c) || c === '"' || c === "'") {
            bad = true;
            break;
          }
          stripped += c;
          masked += "\u0000";
          i += 1;
        }
        if (bad) {
          while (i < raw.length && raw[i] !== ")") {
            if (raw[i] === "\\" && i + 1 < raw.length) {
              // 转义对整体消费：\) 不得把 ) 当普通字符写入后越过边界
              stripped += raw[i] + raw[i + 1];
              masked += "\u0000\u0000";
              i += 2;
              continue;
            }
            stripped += raw[i];
            masked += "\u0000";
            i += 1;
          }
        }
        if (i >= raw.length) return invalidCss();
        stripped += ")";
        masked += ")";
        i += 1;
        continue;
      }
      // 非 url 函数：无转义 ident 整段直写（ident 字符无结构含义，等价于
      // 逐字符路径且免去长 ident 的重复解析）；含转义 ident 一次遍历到
      // ident.end——逐字符回退会让主循环在每个位置重新解析重叠后缀，长
      // 转义 ident 呈二次扫描开销。普通字符原样写入 stripped 与 masked，
      // 转义序列按既有逐字符口径保留原文并写入双 NUL 掩码（parseCssIdent
      // 已整段验证转义合法性，非法形态在入口处整份判无效）
      if (raw.slice(i, ident.end) === ident.value) {
        stripped += raw.slice(i, ident.end);
        masked += raw.slice(i, ident.end);
        i = ident.end;
        continue;
      }
      while (i < ident.end) {
        const c = raw[i];
        if (c === "\\") {
          stripped += c + raw[i + 1];
          masked += ESCAPED_CHAR_MASK + ESCAPED_CHAR_MASK;
          i += 2;
        } else {
          stripped += c;
          masked += c;
          i += 1;
        }
      }
      continue;
    }
    if (ch === "\\") {
      // 字符串外转义：被转义标点（\{ \} 等）不参与深度计数；掩码置非
      // 空白哨兵（转义标点是选择器内容，& 的中缀判定据此停扫）
      stripped += ch;
      masked += ESCAPED_CHAR_MASK;
      if (i + 1 < raw.length) {
        stripped += raw[i + 1];
        masked += ESCAPED_CHAR_MASK;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (ch === "{") {
      depth += 1;
      delimStack.push("{");
    } else if (ch === "}") {
      depth -= 1;
      if (delimStack[delimStack.length - 1] !== "{") return invalidCss();
      delimStack.pop();
      if (depth < 0) return invalidCss();
    } else if (ch === "(") {
      parenDepth += 1;
      delimStack.push("(");
      parenFnStack.push(isPseudoFnParen(stripped, stripped.length));
    } else if (ch === ")") {
      // 多余的闭括号即判无效（与花括号"中途变负已即判"同口径）：钳制在 0 会
      // 让 a { b: c } ) 类残稿经终检漏判为 valid，违反预扫描保守契约
      parenDepth -= 1;
      if (delimStack[delimStack.length - 1] !== "(") return invalidCss();
      delimStack.pop();
      parenFnStack.pop();
      if (parenDepth < 0) return invalidCss();
    } else if (ch === "[") {
      bracketDepth += 1;
      delimStack.push("[");
    } else if (ch === "]") {
      // 属性选择器深度：中途变负即判（多余 ]）——与圆括号同口径
      bracketDepth -= 1;
      if (delimStack[delimStack.length - 1] !== "[") return invalidCss();
      delimStack.pop();
      if (bracketDepth < 0) return invalidCss();
    } else if (
      ch === "&" &&
      parenDepth > 0 &&
      parenFnStack[parenFnStack.length - 1] === true
    ) {
      // 函数式伪类参数内的 &（body:has(&) / :is(body, &) / body:not(&)）：
      // 交原生嵌套解析后作用域前缀化语义不可预测，浏览器支持不一且可能
      // 静默失效无预览反馈——此处只登记旗标不早退：预扫描必须继续完成
      // 全部结构校验，未闭合花括号等结构残稿须判 syntax 而非 unsupported
      //（unsupported 仅表达"可保存但语义受限"，不得短路结构契约）；
      // 旗标在提取阶段后的末闸统一裁决。该 & 仍经下方默认登记进入
      // ampPositions，提取阶段 isMidSelectorAmp 保证此类 & 永不被平铺，
      // 无发射面。声明值/顶层声明内的括号（非伪类函数括号）中的 & 非
      // 结构引用，放行。到达默认路径的 & 必为结构字符（字符串/注释/url
      // 内容/转义对均已被上游分支掩码或消费），无误报面。
      hasPseudoFnAmp = true;
    }
    // 登记坐标取 stripped/masked 系（与平铺提取的切片索引一致）：注释是
    // 唯一变长消费（n 个 raw 字符 → 4 个占位符），raw 下标在此错位
    if (ch === "&") {
      ampPositions.push(stripped.length);
    } else if (ch === "{" || ch === "}") {
      braceMarks.push({ index: stripped.length, open: ch === "{" });
    }
    stripped += ch;
    masked += ch;
    i += 1;
  }
  // 字符串未闭合、花括号深度非零（中途变负已即判）、圆括号未闭合
  // （parenDepth 非零——残稿以 valid 形态外泄会被浏览器 CSS 解析器静默
  // 丢弃，且残稿中逗号会被 hasTopLevelComma 按"括号内逗号"误判）、属性
  // 选择器方括号未闭合（bracketDepth 非零，[foo { 残稿同口径）均无效
  if (
    quote ||
    depth !== 0 ||
    parenDepth !== 0 ||
    bracketDepth !== 0 ||
    delimStack.length !== 0
  ) {
    return invalidCss();
  }
  try {
    const out = [];
    // 选择器列表（逗号）会让作用域前缀只加在第一段，逗号后的成员（如
    // "&, body" → ".scope .kt-style-demo, body"）脱离卡片作用域成为全局
    // 选择器。发现即整份草稿判无效、不输出任何规则；只检查选择器 sel
    // （在掩码副本上查——字符串里的逗号不是列表分隔符），声明值里的逗号
    // （渐变 / rgb / 字体族等）位于 body / rest，不受影响。
    let hasSelectorList = false;
    // 尾组合符（无右操作数，任意深度的 & 规则均纳入判定）与选择器列表
    // 同粒度整份判无效：残稿以 valid 外泄会经保存闸落库，浏览器静默丢弃
    // 后用户得不到任何无效反馈
    let hasTrailingCombinatorSel = false;
    // & 与类型选择器无实空白/组合符直接复合（&x 形态，注释占位间隔同
    // 判——注释不是组合符）：& 不能与类型选择器复合，发射会被浏览器
    // 静默丢弃
    let hasInvalidAmpCompound = false;
    // 候选边界均由预扫描登记（& 位置与花括号位置）：& 与首个 { 之间不得
    // 跨越规则边界——形如 "{ & a } body { color:blue }" 的输入中 & 后首
    // 个花括号是 }，候选即被跳过，sel 不会吞进边界上的 }、发射出的游离 }
    // 不会提前闭合作用域块。只有花括号深度为 0 的顶层 & 规则才被提取展
    // 开；位于媒体查询或其他规则块内的嵌套 & 规则若被提取会丢失外层上
    // 下文，故原样留在 rest（连同其所在块），作为嵌套规则放进作用域块
    // 内，由原生 CSS 嵌套解析为后代（& 解析为作用域选择器），永不逃出
    // 作用域。失败形态（& 后无花括号、先遇 }）整体跳过：旧 ruleRe.exec
    // 形态在此类 & 密集草稿下每次失败 +1 前进并重扫段尾，呈 O(k·n) 二次
    // 开销（32K & 草稿实测 2.4s），登记遍历为 O(& 数＋括号数)。
    let rest = "";
    let cursor = 0;
    // 掩码副本中字符串内括号已置零、注释已置 NUL 占位、预扫描保证全文深度非负，
    // 故逐字符累计花括号深度即真实块结构深度；候选自带的成对括号净深度
    // 为零，扫描游标越过整个候选即可。
    let depth = 0;
    let scanPos = 0;
    let ampIdx = 0;
    let braceIdx = 0;
    let matchEnd = 0;
    while (ampIdx < ampPositions.length) {
      const ampStart = ampPositions[ampIdx];
      ampIdx += 1;
      if (ampStart < matchEnd) continue;
      while (
        braceIdx < braceMarks.length &&
        braceMarks[braceIdx].index < ampStart + 1
      ) {
        braceIdx += 1;
      }
      if (braceIdx >= braceMarks.length || !braceMarks[braceIdx].open) {
        // & 后无花括号（EOF）或先遇 }：不构成规则候选，文本随 rest 透传
        continue;
      }
      const openIdx = braceMarks[braceIdx].index;
      braceIdx += 1;
      while (
        braceIdx < braceMarks.length &&
        braceMarks[braceIdx].index < openIdx + 1
      ) {
        braceIdx += 1;
      }
      if (braceIdx >= braceMarks.length || braceMarks[braceIdx].open) {
        // { 后无 }（EOF）或又遇 {：候选不闭合，文本随 rest 透传——head
        // 文本不进入下方逐成员闸，顶层逗号与尾组合符评估须就地补跑，否则
        // unclosed 候选（如 "&, body { a { b } }"、"& > { a { b } }"）绕过
        // 闸门以 valid 外泄
        if (hasTopLevelComma(masked.slice(ampStart + 1, openIdx))) {
          hasSelectorList = true;
        }
        if (
          hasTrailingCombinatorMember(masked, stripped, ampStart + 1, openIdx)
        ) {
          hasTrailingCombinatorSel = true;
        }
        continue;
      }
      const bodyEnd = braceMarks[braceIdx].index;
      for (let j = scanPos; j < ampStart; j += 1) {
        if (masked[j] === "{") depth += 1;
        else if (masked[j] === "}") depth -= 1;
      }
      scanPos = bodyEnd + 1;
      matchEnd = bodyEnd + 1;
      // 逗号闸对任意深度的 & 规则均生效：嵌套的 "&, body" 经原生解析后
      // body 同样会脱离卡片作用域；只认选择器顶层逗号（见 hasTopLevelComma）
      const headLen = openIdx - ampStart - 1;
      const bodyLen = bodyEnd - openIdx - 1;
      const selStart = ampStart + 1;
      const bodyStart = openIdx + 1;
      const sel = stripped.slice(selStart, selStart + headLen);
      const hasCandidateList = hasTopLevelComma(
        masked.slice(selStart, selStart + headLen)
      );
      if (hasCandidateList) {
        hasSelectorList = true;
      }
      // 尾组合符评估独立于逗号闸且逐成员进行：选择器列表任一成员以组合
      // 符收尾（"& >" 或 ", body >" 形态）同样是无右操作数的结构级无效
      // ——链式短路会在逗号命中时跳过本判定，浏览器对无效选择器列表整
      // 规则静默丢弃而保存闸放行
      if (hasTrailingCombinatorMember(masked, stripped, selStart, openIdx)) {
        hasTrailingCombinatorSel = true;
      }
      let isCompoundCandidate = false;
      if (depth === 0 && !isMidSelectorAmp(masked, ampStart)) {
        // & 与首个有效选择器字符之间无实空白/组合符（直接相邻或仅注释
        // 占位间隔——注释不是组合符）即 & 与类型选择器复合；选择器列表
        // 任一成员的 & 直接毗邻类型性记号同判（成员拆分基于掩码副本顶层
        // 逗号，字符串逗号已置零；括号内成员由预扫描伪类闸先行整稿覆盖）
        // ——置位由末闸整份判无效、不进入平铺
        const afterAmp = sel.replace(/^(?:\/\*\*\/)+/, "");
        let memberCompound = false;
        let memberOffset = 0;
        for (const part of masked
          .slice(selStart, selStart + headLen)
          .split(",")) {
          const member = sel
            .slice(memberOffset, memberOffset + part.length)
            .replace(/\/\*\*\//g, "")
            .replace(/^[ \t\n\r\f]+/, "");
          memberOffset += part.length + 1;
          if (/^&[A-Za-z0-9_\u0080-\uffff\\*-]/.test(member)) {
            memberCompound = true;
            break;
          }
        }
        isCompoundCandidate =
          /^[A-Za-z0-9_\u0080-\uffff\\*-]/.test(afterAmp) || memberCompound;
        if (isCompoundCandidate) {
          hasInvalidAmpCompound = true;
        }
      }
      if (
        depth === 0 &&
        !hasCandidateList &&
        !isCompoundCandidate &&
        !isMidSelectorAmp(masked, ampStart)
      ) {
        const body = stripped.slice(bodyStart, bodyStart + bodyLen);
        // 先冲刷该规则之前累积的 rest 片段（同选择器基块），再输出本条
        // & 规则——输出顺序与源码一致：同特异性规则按书写顺序参与级联，
        // 整体置顶会颠倒用户声明的先后优先级。
        rest += stripped.slice(cursor, ampStart);
        const flushed = trimCssWs(rest);
        if (flushed) {
          out.push(`.${scopeClass} .kt-style-demo { ${flushed} }`);
          rest = "";
        }
        // 仅裁剪 sel 末尾 CSS 空白：& 后的前导空格是后代组合符——
        // "& *" / "& x" 须生成 ".kt-style-demo *" / ".kt-style-demo x"，
        // trim() 会拼出 ".kt-style-demo*"（无效选择器，规则被丢弃），
        // 且 JS trim 会剥 U+00A0（非 CSS 空白）造成窄误放行
        // sel 内残余的结构性 & 替换为 :is(作用域选择器) 保留嵌套语义：
        // 字面 & 进入样式表会被浏览器丢弃；\& 按反斜杠 run 奇偶保护原样
        // 保留；属性串值内的 & 是字符串文本（masked 置零位）而非结构性
        // 嵌套引用，原样保留不改写
        const scopedAmp = `:is(.${scopeClass} .kt-style-demo)`;
        let flatSel = "";
        for (let k = 0; k < sel.length; k += 1) {
          if (sel[k] === "&") {
            let backslashes = 0;
            for (let b = k - 1; b >= 0 && sel[b] === "\\"; b -= 1) {
              backslashes += 1;
            }
            flatSel +=
              backslashes % 2 === 1 || masked[ampStart + 1 + k] === "\u0000"
                ? "&"
                : scopedAmp;
          } else {
            flatSel += sel[k];
          }
        }
        flatSel = flatSel.replace(/[ \t\n\r\f]+$/, "");
        out.push(
          `.${scopeClass} .kt-style-demo${flatSel} { ${trimCssWs(body)} }`
        );
        // 仅顶层规则推进游标；嵌套匹配不推进——其文本随后续切片并入 rest
        cursor = bodyEnd + 1;
      }
    }
    rest += stripped.slice(cursor);
    // 末闸 syntax 先行：结构残损（尾随组合器/非法 & 复合）属"不可保存"
    // 语义且优先级高于 unsupported——同稿两旗并存（如 "&, body > { ... }"）
    // 时返回 syntax，与终检路径对结构残稿的口径一致；unsupported 仅留给
    // 结构完整但语义受限的输入。
    if (hasTrailingCombinatorSel || hasInvalidAmpCompound) {
      return invalidCss();
    }
    if (hasSelectorList || hasPseudoFnAmp) {
      return invalidCss("unsupported");
    }
    const flushedRest = trimCssWs(rest);
    if (flushedRest) {
      out.push(`.${scopeClass} .kt-style-demo { ${flushedRest} }`);
    }
    return { css: out.join("\n"), valid: true };
  } catch {
    return invalidCss();
  }
}
