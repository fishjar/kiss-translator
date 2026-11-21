import { compileCss, sanitizeScopeSlug } from "./compileCss";

describe("compileCss nested-rule preservation", () => {
  // 契约：仅深度 0 的顶层 & 规则被展开为作用域后代选择器；位于媒体查询
  // 或其他规则块内的 & 规则必须原样保留在 rest 中，交由原生 CSS 嵌套
  // 解析——提取会丢失外层上下文，产生与用户草稿语义不符的全局化规则。
  test("keeps an & rule inside a media query nested for native CSS resolution", () => {
    const { css, valid } = compileCss(
      "kt-scope-x",
      "@media (min-width: 100px) { & a { color: red } }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { @media (min-width: 100px) { & a { color: red } } }"
    );
    // 绝不允许 & 规则被展开后逃逸到媒体查询外成为顶层规则
    expect(css).not.toMatch(/\.kt-style-demo a \{/);
  });

  test("keeps an & rule nested inside a plain block rule", () => {
    const { css, valid } = compileCss(
      "kt-scope-x",
      "body { & b { color: blue } }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { body { & b { color: blue } } }"
    );
    expect(css).not.toMatch(/\.kt-style-demo b \{/);
  });

  test("extracts only top-level & rules and preserves nested ones without loss", () => {
    const { css, valid } = compileCss(
      "kt-scope-x",
      "&:hover { color: blue } @media screen { & a { color: red } }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo:hover { color: blue }\n" +
        ".kt-scope-x .kt-style-demo { @media screen { & a { color: red } } }"
    );
    // 嵌套内容不得被游标处理删除或重复发射
    expect(css.match(/color: red/g)).toHaveLength(1);
    expect(css.match(/color: blue/g)).toHaveLength(1);
  });

  test("emits interleaved rules in source order for equal-specificity cascade", () => {
    // 输出顺序与源码一致：同特异性规则按书写顺序参与级联——声明在后的
    // & 规则不得被 rest 兜底整体置顶而颠倒优先级
    const { css, valid } = compileCss(
      "kt-scope-x",
      "color: red; & a { color: blue } color: green"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { color: red; }\n" +
        ".kt-scope-x .kt-style-demo a { color: blue }\n" +
        ".kt-scope-x .kt-style-demo { color: green }"
    );
  });

  test("still rejects a selector list inside a nested & rule", () => {
    const { css, valid } = compileCss(
      "kt-scope-x",
      "@media screen { &, body { color: red } }"
    );
    // 逗号作用域闸对任意深度的 & 规则均生效
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("accepts a comma inside a functional pseudo-class argument", () => {
    // 括号内的逗号是函数式伪类参数：":not(.a, .b)" 展开后整体仍挂在
    // 作用域前缀下，非选择器列表，不得误判整份无效
    const { css, valid } = compileCss(
      "kt-scope-x",
      "&:not(.a, .b) { color: red }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(".kt-scope-x .kt-style-demo:not(.a, .b) { color: red }");
  });

  test("accepts commas inside a string in the selector", () => {
    // 掩码副本中字符串内逗号已置零，[data-x="a,b"] 非选择器列表
    const { css, valid } = compileCss(
      "kt-scope-x",
      '&[data-x="a,b"] { color: red }'
    );
    expect(valid).toBe(true);
    expect(css).toBe('.kt-scope-x .kt-style-demo[data-x="a,b"] { color: red }');
  });

  test("still rejects a selector list comma after a functional pseudo-class closes", () => {
    // 伪类括号闭合后再出现的逗号是真实的列表分隔符：第二个成员 body
    // 会脱离卡片作用域，仍须整份判无效
    const { css, valid } = compileCss(
      "kt-scope-x",
      "&:not(a), body { color: red }"
    );
    expect(valid).toBe(false);
    expect(css).toBe("");
  });
});

describe("compileCss non-string input gate", () => {
  test("returns invalid for non-string styleCode without throwing", () => {
    // 导入/同步通道可能注入非字符串 styleCode（如 123）：raw.trim() 会抛
    // TypeError 崩页面，违反文件头"绝不抛错"契约——非字符串整份判无效
    expect(compileCss("kt-scope-x", 123)).toEqual({ css: "", valid: false });
    expect(compileCss("kt-scope-x", null)).toEqual({ css: "", valid: false });
    expect(compileCss("kt-scope-x", undefined)).toEqual({
      css: "",
      valid: false,
    });
    expect(compileCss("kt-scope-x", {})).toEqual({ css: "", valid: false });
  });

  test("keeps empty and whitespace-only strings valid", () => {
    // 空串语义不变：valid:true、无规则输出（空白样式卡片不进 invalid 形态）
    expect(compileCss("kt-scope-x", "")).toEqual({ css: "", valid: true });
    expect(compileCss("kt-scope-x", "   ")).toEqual({ css: "", valid: true });
  });
});

describe("compileCss mid-selector & preservation", () => {
  test("keeps the ancestor condition of a prefixed & rule nested", () => {
    // "html.dark &" 中 & 前有祖先文本：不得提取为无条件规则，也不得把
    // 祖先文本残留成垃圾 rest 块——整条留 rest 走原生 CSS 嵌套，祖先条件
    // 保留且永不逃出作用域
    const { css, valid } = compileCss(
      "kt-scope-x",
      "html.dark & { color: red }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(".kt-scope-x .kt-style-demo { html.dark & { color: red } }");
    // 绝不允许无 dark 条件的 color 规则被发射
    expect(css).not.toMatch(/^\.kt-scope-x \.kt-style-demo \{ color: red/m);
    // 垃圾 rest 块（祖先文本被拆出）不得出现
    expect(css).not.toContain("{ html.dark }");
  });

  test("still extracts a & rule that follows a closed block", () => {
    // & 前是规则边界 }：仍是顶层规则起点，按现状提取
    const { css, valid } = compileCss("kt-scope-x", "x { y:z } & a { b:c }");
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { x { y:z } }\n.kt-scope-x .kt-style-demo a { b:c }"
    );
  });

  test("still extracts a & rule at the start of the draft", () => {
    // 文首 &：无祖先文本，按现状提取
    const { css, valid } = compileCss("kt-scope-x", "& a { b:c }");
    expect(valid).toBe(true);
    expect(css).toBe(".kt-scope-x .kt-style-demo a { b:c }");
  });

  test("treats a declaration-ending semicolon as a rule boundary", () => {
    // 声明结束的 ; 与 } 同为规则边界：; 之后的 & 是新规则起点而非选择器
    // 中缀——展开为两条平铺规则（前一条声明 + & 规则），与 } 边界行为
    // 一致，且对无原生 CSS 嵌套的环境保持平铺兼容
    const { css, valid } = compileCss(
      "kt-scope-x",
      "color: red; &:hover { color: blue }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { color: red; }\n" +
        ".kt-scope-x .kt-style-demo:hover { color: blue }"
    );
    // 绝不允许 & 规则整体滞留 rest 成单块嵌套形态
    expect(css).not.toMatch(/color: red; &:hover/);
  });

  test("still keeps a & selector-suffix mid-rule when no boundary precedes", () => {
    // 无边界字符（html.dark 紧邻 &）：中缀判定不回归
    const { css, valid } = compileCss(
      "kt-scope-x",
      "html.dark & { color: red }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(".kt-scope-x .kt-style-demo { html.dark & { color: red } }");
  });
});

describe("compileCss raw newline inside a string", () => {
  test("rejects an unescaped newline inside a string", () => {
    // CSS 字符串不允许未转义的换行（规范 bad-string token）：原样保留会
    // 发射跨行字符串值的非法 CSS，整份判无效（与未闭合字符串同口径）
    const { css, valid } = compileCss("kt-scope-x", 'content: "a\nb"');
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects carriage return and form feed inside a string", () => {
    expect(compileCss("kt-scope-x", 'content: "a\rb"').valid).toBe(false);
    expect(compileCss("kt-scope-x", 'content: "a\fb"').valid).toBe(false);
  });

  test("keeps an escaped line continuation inside a string valid", () => {
    // 转义续行（\ 后跟换行）在转义对分支整体保留，不触发无效闸
    const { css, valid } = compileCss("kt-scope-x", 'content: "a\\\nb"');
    expect(valid).toBe(true);
    expect(css).toBe('.kt-scope-x .kt-style-demo { content: "a\\\nb" }');
  });
});

describe("compileCss unquoted url tokens", () => {
  test("rejects the reviewer PoC where the url swallows a structural brace", () => {
    // 浏览器把 url token 内容（含花括号）作为 token 消费：url({) 之后的
    // } 在真实解析中提前闭合作用域包装块，body 规则逃逸为顶层规则。url
    // 感知扫描对 url 内容结构透明后，该 } 裸露于深度 0 → 整份判无效，
    // 绝不通过校验（修复前按结构性计数配平、误判有效并输出逃逸 CSS）
    const { css, valid } = compileCss(
      "kt-scope-x",
      "background: url({) } body { position: fixed; inset: 0 }"
    );
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("recognizes the url token case-insensitively", () => {
    const { css, valid } = compileCss(
      "kt-scope-x",
      "background: URL({) } body { position: fixed; inset: 0 }"
    );
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("keeps a balanced draft with an unquoted url scoped and valid", () => {
    // 配平形态：url 内容对结构透明后整份留在作用域块内，body 仅作为
    // 嵌套规则存在、绝不成为顶层规则（原文精确锁）
    const { css, valid } = compileCss(
      "kt-scope-x",
      "{ background: url({) } body { position: fixed; inset: 0 }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { { background: url({) } body { position: fixed; inset: 0 } }"
    );
  });

  test("keeps a quoted url handled by the string state", () => {
    // 带引号 url 已由既有字符串状态正确掩码，不受 url 分支影响
    const { css, valid } = compileCss(
      "kt-scope-x",
      'background: url("a{b}.png")'
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      '.kt-scope-x .kt-style-demo { background: url("a{b}.png") }'
    );
  });

  test("rejects an unterminated unquoted url at EOF", () => {
    // EOF 未闭合：无法安全界定 token 边界，保守判无效（修复前无括号内容
    // 不参与深度计数，会误判有效）
    expect(compileCss("kt-scope-x", "background: url(a").valid).toBe(false);
  });

  test("consumes a bad-url up to its closing paren", () => {
    // 未转义引号出现在无引号 url 内容中 → bad-url：吞至 ) 为止，内容对
    // 结构透明（修复前该引号误开字符串状态、整份误判无效）
    const { css, valid } = compileCss(
      "kt-scope-x",
      '{ background: url(a"b) } body { color: red }'
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      '.kt-scope-x .kt-style-demo { { background: url(a"b) } body { color: red } }'
    );
  });

  test("rejects an escaped-identifier url form that hides an unbalanced brace", () => {
    // \75 rl(（解码为 url(）+ 裸 }：修复前转义对拆散扫描、url 内花括号
    // 被结构性计数而配平误判有效并输出逃逸 CSS；url 感知后裸 } 裸露 → 无效
    expect(
      compileCss(
        "kt-scope-x",
        "background: \\75 rl({) } body { color: red }"
      ).valid
    ).toBe(false);
  });

  test("keeps a balanced escaped-identifier url scoped and valid", () => {
    // 转义标识符识别（\75 rl( 解码为 url()：配平形态整份留在作用域块内
    const { css, valid } = compileCss(
      "kt-scope-x",
      "{ background: \\75 rl({) } body { color: red }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { { background: \\75 rl({) } body { color: red } }"
    );
  });
});

describe("sanitizeScopeSlug", () => {
  test("maps safe slugs identically", () => {
    // [A-Za-z0-9_-] 逐字符恒等：现有夹具类名（kt-scope-custom-a 等）不变
    ["custom-a", "marker", "x", "custom_9f3b", "A-Z_0-9", "a"].forEach(
      (slug) => {
        expect(sanitizeScopeSlug(slug)).toBe(slug);
      }
    );
  });

  test("encodes unsafe slugs without commas or spaces", () => {
    const outputs = [
      sanitizeScopeSlug("x, body"),
      sanitizeScopeSlug("x body"),
      sanitizeScopeSlug("x;body"),
      sanitizeScopeSlug("样式"),
      sanitizeScopeSlug("x.y"),
    ];
    outputs.forEach((out) => {
      expect(out).not.toMatch(/[,\s]/);
    });
  });

  test("keeps distinct unsafe slugs distinct (injective encoding)", () => {
    const outputs = [
      sanitizeScopeSlug("x, body"),
      sanitizeScopeSlug("x body"),
      sanitizeScopeSlug("x,  body"),
      sanitizeScopeSlug("xbody"),
      sanitizeScopeSlug("x_u002c_body"),
    ];
    expect(new Set(outputs).size).toBe(outputs.length);
  });
});

describe("compileCss escape hardening", () => {
  test("parseCssIdent hex codepoint beyond Unicode range degrades to U+FFFD instead of throwing", () => {
    // \110000 解析为 0x110000 > 0x10FFFF，旧实现 String.fromCodePoint 抛 RangeError；
    // 契约：解析层以 U+FFFD 替代超界码点不崩、整份仍有效；输出层按既有
    // 设计原样透传转义序列（解码仅用于 url 函数识别），U+FFFD 替代由
    // 浏览器端 CSS 解析器按规范执行
    expect(() => compileCss("kt-scope-x", "a\\110000 { color: red }")).not.toThrow();
    const { css, valid } = compileCss("kt-scope-x", "a\\110000 { color: red }");
    expect(valid).toBe(true);
    expect(css).toContain("a\\110000");
  });

  test("escaped space inside unquoted url keeps the token tolerant", () => {
    // \ + 空格在 url token 内是合法转义（修复前经 bad-url 容忍路径、
    // 修复后经合法转义路径，均须 valid:true）——回归锁，防行为回退
    const { valid } = compileCss("kt-scope-x", "body { color: url(a\\ b) }");
    expect(valid).toBe(true);
  });

  test("escaped close-paren does not terminate bad-url remainder consumption", () => {
    // bad-url 剩余消费循环须把转义对当整体消费：先由未转义空格触发 bad，
    // 其后的 \) 落在残余段内——不得被当作终止符；本输入无真正的结束
    // 右括号，残余消费直达 EOF → 整份无效（既有 EOF 语义）
    // 红绿机理：修复前残余消费被 \) 的 ")" 截断误闭合 → valid:true；
    // 修复后转义对整体消费至 EOF 触发 invalid → valid:false
    const { valid } = compileCss("kt-scope-x", "url(a b\\)c { color: red }");
    expect(valid).toBe(false);
  });

  test("bad-url with escaped paren before terminator stays masked-tolerant", () => {
    // \) 在终止 ) 之前：转义对整体消费后仍能到达真正的 ) 终止符，
    // bad-url 被掩码容忍，整份有效
    const { css, valid } = compileCss("kt-scope-x", "url(a\\)b) { color: red }");
    expect(valid).toBe(true);
    expect(css).toContain("url(a\\)b)");
  });

  test("accepts an escaped space in a plain ident selector", () => {
    // \ + 空格是 CSS 标识符合法转义（a\ b {} 应可编译）：修复前
    // parseCssIdent 把 \ + 空白误判非法转义、整份判 invalid；修复后与 url
    // 分支 bad-url 判定同口径（仅 EOF/换行类非法）。输出层按既有契约
    // 原样透传转义序列（解码 value 仅用于 url 函数识别）
    const { css, valid } = compileCss("kt-scope-x", "a\\ b { color: red }");
    expect(valid).toBe(true);
    expect(css).toContain("a\\ b");
  });

  test("rejects & inside a :has() argument", () => {
    // 函数式伪类参数内的 &（body:has(&)）交原生嵌套解析后作用域前缀化
    // 语义不可预测，浏览器支持不一且可能静默失效无预览反馈——契约：
    // 整份判无效。失效形态：现行预处理无圆括号深度跟踪，& 被判中缀留
    // rest，valid:true
    const { css, valid } = compileCss("kt-scope-x", "body:has(&) { color: red }");
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects & after a quoted url( inside a :has() argument", () => {
    // 带引号 url 的开括号计入圆括号深度：url( 由 url 分支消费、不经默认
    // 路径计数，闭括号却走默认路径递减——不补计的话 body:has(url("a"), &)
    // 的中间态深度提前归零，& 闸被击穿、残稿以 valid 外泄
    const { css, valid } = compileCss(
      "kt-scope-x",
      'body:has(url("a"), &) { color: red }'
    );
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects a draft with a surplus closing paren", () => {
    // 多余的 ) 不被钳制掩盖：负深度即判无效（与花括号中途变负同口径），
    // 残稿不得以 valid 外泄
    const { css, valid } = compileCss("kt-scope-x", "a { b: c } )");
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("still accepts balanced parens spanning declarations and url tokens", () => {
    // 修复不误伤：配平形态（函数式伪类 + 无引号 url + 带引号 url）保持 valid
    const { css, valid } = compileCss(
      "kt-scope-x",
      'body:has(url(a), .b) { color: url("c.png") }'
    );
    expect(valid).toBe(true);
    expect(css).toContain('url("c.png")');
  });

  test("keeps a valid quoted url( in a :has() argument balanced", () => {
    // 补计开括号后带引号 url 净深度为零，合法输入不受影响
    const { css, valid } = compileCss(
      "kt-scope-x",
      '& { background: url("a.png") }'
    );
    expect(valid).toBe(true);
    expect(css).toContain('url("a.png")');
  });

  test("rejects & inside an :is() argument", () => {
    // 契约同上：:is(body, &) 参数内结构 & 整份无效
    const { css, valid } = compileCss("kt-scope-x", ":is(body, &) { color: red }");
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects & inside a :not() argument", () => {
    // 契约同上：body:not(&) 参数内结构 & 整份无效
    const { css, valid } = compileCss("kt-scope-x", "body:not(&) { color: red }");
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects an unclosed paren in a functional pseudo-class", () => {
    // 未闭合圆括号：parenDepth 终检（预扫描结束时非零 → 整份无效）——
    // 否则括号不配对的残稿以 valid 形态交给浏览器 CSS 解析器静默丢弃，
    // 且残稿中后续顶层逗号会被 hasTopLevelComma 按"括号内逗号"误判
    const { css, valid } = compileCss("kt-scope-x", "body:not(a { color: red }");
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects a draft whose unclosed paren swallows a later comma", () => {
    // 残稿中未闭合括号吞掉后续顶层逗号（hasTopLevelComma 在 depth≥1 时
    // 不判顶层）——终检兜底使整份无效，残稿不外泄
    const { valid } = compileCss(
      "kt-scope-x",
      "body:not(a, { color: red } & b { color: blue }"
    );
    expect(valid).toBe(false);
  });
});

describe("compileCss comment token separation", () => {
  test("keeps a comment inside an ident from merging a url function", () => {
    // 注释是 token 分隔符：u/*c*/rl 不得并成 url( 触发 url token 路径，
    // 预扫描 token 化须与浏览器一致
    const { css, valid } = compileCss("kt-scope-x", "color: u/*c*/rl(x)");
    expect(valid).toBe(true);
    expect(css).not.toContain("url(");
    expect(css).toContain("u/**/rl(x)");
  });

  test("keeps a comment between the url ident and its paren from forming a url token", () => {
    // url/*c*/(x)：浏览器视注释分隔后不再构成 url 函数，剥除注释并成的
    // url( 形态必须被占位隔断
    const { css, valid } = compileCss(
      "kt-scope-x",
      "background: url/*c*/(a.png)"
    );
    expect(valid).toBe(true);
    expect(css).not.toContain("url(");
    expect(css).toContain("url/**/(a.png)");
  });

  test("keeps a comment in a selector from merging compound selectors", () => {
    // &/*c*/x 是两个 token（& 与 x 后代关系），并成 &x 会发射
    // .kt-style-demox 错误复合选择器——注释占位后输出含 /**/ 分隔
    const { css, valid } = compileCss("kt-scope-x", "&/*c*/x { color: red }");
    expect(valid).toBe(true);
    expect(css).toBe(".kt-scope-x .kt-style-demo/**/x { color: red }");
    expect(css).not.toContain("kt-style-demox");
  });

  test("still rejects an unclosed comment", () => {
    // 未闭合注释无效闸保留（与未闭合字符串同口径）
    const { css, valid } = compileCss("kt-scope-x", "& { color: red } /* 未闭合");
    expect(valid).toBe(false);
    expect(css).toBe("");
  });
});
