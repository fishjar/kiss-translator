// 安全 CSS 编译解析器：把用户草稿按卡片作用域编译（& 嵌套展开为作用域
// 后代选择器）；括号不配对等语法无效 → { css: "", valid: false } 优雅
// 降级（is-invalid 形态），绝不抛错崩页面。StylesSetting 卡片演示与
// Rules 下拉的 custom 项预览共用同一校验口径。
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

// 作用域类名 slug 净化：[A-Za-z0-9_-] 逐字符恒等（既有夹具类名
// kt-scope-custom-a 等不受影响），其余字符按码点 uXXXX 编码。编码对"含不
// 安全字符的 slug"彼此单射——任意两个 forged slug 不会碰撞；安全 slug 与
// 编码结果的理论碰撞只能由伪造 slug 精心构造，超出预览作用域隔离的威胁
// 模型（防御目标是逗号/空白不得进入选择器生成选择器列表逃逸）。
export function sanitizeScopeSlug(slug) {
  return String(slug).replace(/[^A-Za-z0-9_-]/g, (ch) =>
    `u${ch.codePointAt(0).toString(16).padStart(4, "0")}`
  );
}

// 判定 & 匹配是否为"选择器中缀 &"（& 前有祖先选择器文本，如
// "html.dark &"）：在掩码副本上从 match.index-1 向左跳过空白，先遇 {
// 或 } 或文本起点 → 规则边界，按顶层规则提取；先遇其他非空白字符 →
// 中缀 &，不提取（整条随后续切片并入 rest，由原生 CSS 嵌套解析
// & = 父选择器，祖先条件保留且永不逃出作用域）。; 视为前一条声明结束/
// 新规则开始的边界（与 } 同权）：声明后跟随的 &（如 "color: red;
// &:hover"）是新规则起点，按顶层规则平铺提取——掩码副本中字符串内
// 字符已置 \u0000（非空白，判中缀，保守安全；字符串内的 ; 不会被越过
// 字符串边界的扫描触及），注释已置 NUL 占位。
function isMidSelectorAmp(masked, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = masked[i];
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") {
      return ch !== "{" && ch !== "}" && ch !== ";";
    }
  }
  return false;
}

// CSS 空白（url token 起始空白与 bad-url 判定用）
function isCssWs(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
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
      if (
        nxt === undefined ||
        nxt === "\n" ||
        nxt === "\r" ||
        nxt === "\f"
      ) {
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

export function compileCss(scopeClass, raw) {
  // 非字符串闸：导入/同步通道可能注入非字符串 styleCode（如 123），
  // raw.trim() 会抛 TypeError 崩页面——非字符串整份判无效，空/纯空白
  // 字符串保持 valid:true 的既有语义。
  if (typeof raw !== "string") return { css: "", valid: false };
  if (!raw || !raw.trim()) return { css: "", valid: true };
  // 预处理单遍扫描：剥注释、跟踪字符串与转义状态，同时做花括号深度计数。
  // 字符串/注释内的花括号不参与深度计数，也不得被 & 规则正则误捕——否则
  // 扫描计数与真实解析器的块结构错位（content: "{" / "}"、/* & x { } */
  // 会造成误判无效或把注释当规则发射）。产出两份等长文本：
  //   stripped — 注释以空注释占位保留（token 分隔；字符串原样保留，输出
  //   拼装基于它）
  //   masked   — 字符串内部字符替换为 \u0000 的掩码副本（& 规则正则在它
  //              上跑，命中索引可直接映射回 stripped 取真实 sel/body）
  // 无法安全处理的输入（注释/字符串未闭合）整份判无效，作用域闸不缺口。
  // 圆括号深度同遍跟踪：函数式伪类参数内的结构 &（body:has(&) 等）判
  // 整份无效——交原生嵌套解析后作用域前缀化语义不可预测，浏览器支持
  // 不一且可能静默失效无预览反馈。
  let depth = 0;
  let parenDepth = 0;
  let stripped = "";
  let masked = "";
  let quote = "";
  for (let i = 0; i < raw.length; ) {
    const ch = raw[i];
    if (quote) {
      // 字符串内部：原文保留、掩码置零；转义对（\" 等）整体保留
      if (ch === "\\") {
        stripped += ch;
        masked += "\u0000";
        if (i + 1 < raw.length) {
          stripped += raw[i + 1];
          masked += "\u0000";
          i += 2;
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
        return { css: "", valid: false };
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
      if (end === -1) return { css: "", valid: false };
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
      if (ident === null) return { css: "", valid: false };
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
            if (nxt === undefined || nxt === "\n" || nxt === "\r" || nxt === "\f") {
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
        if (i >= raw.length) return { css: "", valid: false };
        stripped += ")";
        masked += ")";
        i += 1;
        continue;
      }
      // 非 url 函数：无转义 ident 整段直写（ident 字符无结构含义，等价于
      // 逐字符路径且免去长 ident 的重复解析）；含转义 ident 交回逐字符
      // 路径（转义字符须按既有掩码口径置零）
      if (raw.slice(i, ident.end) === ident.value) {
        stripped += raw.slice(i, ident.end);
        masked += raw.slice(i, ident.end);
        i = ident.end;
        continue;
      }
    }
    if (ch === "\\") {
      // 字符串外转义：被转义标点（\{ \} 等）不参与深度计数
      stripped += ch;
      masked += "\u0000";
      if (i + 1 < raw.length) {
        stripped += raw[i + 1];
        masked += "\u0000";
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth < 0) return { css: "", valid: false };
    } else if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")") {
      // 多余的闭括号即判无效（与花括号"中途变负已即判"同口径）：钳制在 0 会
      // 让 a { b: c } ) 类残稿经终检漏判为 valid，违反预扫描保守契约
      parenDepth -= 1;
      if (parenDepth < 0) return { css: "", valid: false };
    } else if (ch === "&" && parenDepth > 0) {
      // 函数式伪类参数内的 &（body:has(&) / :is(body, &) / body:not(&)）：
      // 交原生嵌套解析后作用域前缀化语义不可预测，浏览器支持不一且可能
      // 静默失效无预览反馈——整份判无效。到达默认路径的 & 必为结构字符
      // （字符串/注释/url 内容/转义对均已被上游分支掩码或消费），无误报面。
      return { css: "", valid: false };
    }
    stripped += ch;
    masked += ch;
    i += 1;
  }
  // 字符串未闭合、花括号深度非零（中途变负已即判）、圆括号未闭合
  // （parenDepth 非零——残稿以 valid 形态外泄会被浏览器 CSS 解析器静默
  // 丢弃，且残稿中逗号会被 hasTopLevelComma 按"括号内逗号"误判）均无效
  if (quote || depth !== 0 || parenDepth !== 0) {
    return { css: "", valid: false };
  }
  try {
    const out = [];
    // 选择器列表（逗号）会让作用域前缀只加在第一段，逗号后的成员（如
    // "&, body" → ".scope .kt-style-demo, body"）脱离卡片作用域成为全局
    // 选择器。发现即整份草稿判无效、不输出任何规则；只检查选择器 sel
    // （在掩码副本上查——字符串里的逗号不是列表分隔符），声明值里的逗号
    // （渐变 / rgb / 字体族等）位于 body / rest，不受影响。
    let hasSelectorList = false;
    // sel/body 捕获组均排除左右花括号（[^{}]*）：匹配绝不可能跨越规则
    // 边界——否则形如 "{ & a } body { color:blue }" 的输入会让 sel 吞进
    // 边界上的 }，发射出的游离 } 提前闭合作用域块、其后的 body 规则逃逸
    // 为全局选择器。只有花括号深度为 0 的顶层 & 规则才被提取展开；位于
    // 媒体查询或其他规则块内的嵌套 & 规则若被提取会丢失外层上下文，故
    // 原样留在 rest（连同其所在块），作为嵌套规则放进作用域块内，由原生
    // CSS 嵌套解析为后代（& 解析为作用域选择器），永不逃出作用域。
    const ruleRe = /&([^{}]*)\{([^{}]*)\}/g;
    let rest = "";
    let cursor = 0;
    // 掩码副本中字符串内括号已置零、注释已置 NUL 占位、预扫描保证全文深度非负，
    // 故逐字符累计花括号深度即真实块结构深度；匹配自带的成对括号净深度
    // 为零，扫描游标越过整个匹配即可。
    let depth = 0;
    let scanPos = 0;
    let match;
    while ((match = ruleRe.exec(masked)) !== null) {
      for (let j = scanPos; j < match.index; j += 1) {
        if (masked[j] === "{") depth += 1;
        else if (masked[j] === "}") depth -= 1;
      }
      scanPos = match.index + match[0].length;
      // 逗号闸对任意深度的 & 规则均生效：嵌套的 "&, body" 经原生解析后
      // body 同样会脱离卡片作用域；只认选择器顶层逗号（见 hasTopLevelComma）
      if (hasTopLevelComma(match[1])) {
        hasSelectorList = true;
      } else if (depth === 0 && !isMidSelectorAmp(masked, match.index)) {
        const selStart = match.index + 1;
        const bodyStart = selStart + match[1].length + 1;
        const sel = stripped.slice(selStart, selStart + match[1].length);
        const body = stripped.slice(bodyStart, bodyStart + match[2].length);
        // 先冲刷该规则之前累积的 rest 片段（同选择器基块），再输出本条
        // & 规则——输出顺序与源码一致：同特异性规则按书写顺序参与级联，
        // 整体置顶会颠倒用户声明的先后优先级。
        rest += stripped.slice(cursor, match.index);
        if (rest.trim()) {
          out.push(`.${scopeClass} .kt-style-demo { ${rest.trim()} }`);
          rest = "";
        }
        // 仅裁剪 sel 末尾空白：& 后的前导空格是后代组合符——
        // "& *" / "& x" 须生成 ".kt-style-demo *" / ".kt-style-demo x"，
        // trim() 会拼出 ".kt-style-demo*"（无效选择器，规则被丢弃）
        out.push(
          `.${scopeClass} .kt-style-demo${sel.trimEnd()} { ${body.trim()} }`
        );
        // 仅顶层规则推进游标；嵌套匹配不推进——其文本随后续切片并入 rest
        cursor = match.index + match[0].length;
      }
    }
    rest += stripped.slice(cursor);
    if (hasSelectorList) return { css: "", valid: false };
    if (rest.trim()) {
      out.push(`.${scopeClass} .kt-style-demo { ${rest.trim()} }`);
    }
    return { css: out.join("\n"), valid: true };
  } catch {
    return { css: "", valid: false };
  }
}
