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
    expect(compileCss("kt-scope-x", 123)).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
    expect(compileCss("kt-scope-x", null)).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
    expect(compileCss("kt-scope-x", undefined)).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
    expect(compileCss("kt-scope-x", {})).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
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
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { html.dark & { color: red } }"
    );
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
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { html.dark & { color: red } }"
    );
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

  test("keeps an escaped CRLF line continuation inside a string valid", () => {
    // CRLF 文件中的转义续行：\<CR><LF> 是单个续行 token，须整体保留——转义
    // 对分支只吞 \+\r 时裸 \n 残留命中无效闸，CRLF 源文件的合法续行被整份
    // 误判无效；输出与 LF 续行同口径原文保留
    const { css, valid } = compileCss("kt-scope-x", 'content: "a\\\r\nb"');
    expect(valid).toBe(true);
    expect(css).toBe('.kt-scope-x .kt-style-demo { content: "a\\\r\nb" }');
  });
});

describe("compileCss unquoted url tokens", () => {
  test("rejects an unquoted url that swallows a structural brace", () => {
    // 浏览器把 url token 内容（含花括号）作为 token 消费：url({) 之后的
    // } 在真实解析中提前闭合作用域包装块，body 规则逃逸为顶层规则。url
    // 感知扫描对 url 内容结构透明后，该 } 裸露于深度 0 → 整份判无效，
    // 绝不通过校验。
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
    // EOF 未闭合：无法安全界定 token 边界，保守判无效。
    expect(compileCss("kt-scope-x", "background: url(a").valid).toBe(false);
  });

  test("consumes a bad-url up to its closing paren", () => {
    // 未转义引号出现在无引号 url 内容中 → bad-url：吞至 ) 为止，内容对
    // 结构透明。
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
    // \75 rl(（解码为 url(）+ 裸 }：url 内容对结构透明——裸 } 裸露于
    // 深度 0 判无效；若转义对被拆散扫描，url 内花括号被结构性计数配平，
    // 会输出逃逸 CSS
    expect(
      compileCss("kt-scope-x", "background: \\75 rl({) } body { color: red }")
        .valid
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

  test("keeps distinct unsafe slugs distinct across the sampled inputs", () => {
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
    // \110000 解析为 0x110000 > 0x10FFFF（超出 Unicode 上界）；
    // 契约：解析层以 U+FFFD 替代超界码点不崩、整份仍有效；输出层按既有
    // 设计原样透传转义序列（解码仅用于 url 函数识别），U+FFFD 替代由
    // 浏览器端 CSS 解析器按规范执行
    expect(() =>
      compileCss("kt-scope-x", "a\\110000 { color: red }")
    ).not.toThrow();
    const { css, valid } = compileCss("kt-scope-x", "a\\110000 { color: red }");
    expect(valid).toBe(true);
    expect(css).toContain("a\\110000");
  });

  test("escaped space inside unquoted url keeps the token tolerant", () => {
    // \ + 空格在 url token 内是合法转义，经合法转义路径放行（valid:true）
    // ——回归锁，防行为回退
    const { valid } = compileCss("kt-scope-x", "body { color: url(a\\ b) }");
    expect(valid).toBe(true);
  });

  test("escaped close-paren does not terminate bad-url remainder consumption", () => {
    // bad-url 剩余消费循环须把转义对当整体消费：先由未转义空格触发 bad，
    // 其后的 \) 落在残余段内——不得被当作终止符；本输入无真正的结束
    // 右括号，残余消费直达 EOF → 整份无效（既有 EOF 语义）
    const { valid } = compileCss("kt-scope-x", "url(a b\\)c { color: red }");
    expect(valid).toBe(false);
  });

  test("bad-url with escaped paren before terminator stays masked-tolerant", () => {
    // 先由未转义空格触发 bad，残余段内 \) 经转义对整体消费后到达真正的
    // ) 终止符：bad-url 被掩码容忍，整份有效。变异机理：残余消费若把 \)
    // 的 ) 当终止符提前闭合，输出与 valid 语义即偏离本断言
    const { css, valid } = compileCss(
      "kt-scope-x",
      "url(a b\\)c) { color: red }"
    );
    expect(valid).toBe(true);
    expect(css).toContain("url(a b\\)c)");
  });

  test("accepts an escaped space in a plain ident selector", () => {
    // \ + 空格是 CSS 标识符合法转义（a\ b {} 应可编译）：与 url
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
    const { css, valid } = compileCss(
      "kt-scope-x",
      "body:has(&) { color: red }"
    );
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

  test("keeps a quoted url in a declaration balanced", () => {
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
    const { css, valid } = compileCss(
      "kt-scope-x",
      ":is(body, &) { color: red }"
    );
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects & inside a :not() argument", () => {
    // 契约同上：body:not(&) 参数内结构 & 整份无效
    const { css, valid } = compileCss(
      "kt-scope-x",
      "body:not(&) { color: red }"
    );
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("rejects an unclosed paren in a functional pseudo-class", () => {
    // 未闭合圆括号：parenDepth 终检（预扫描结束时非零 → 整份无效）——
    // 否则括号不配对的残稿以 valid 形态交给浏览器 CSS 解析器静默丢弃，
    // 且残稿中后续顶层逗号会被 hasTopLevelComma 按"括号内逗号"误判
    const { css, valid } = compileCss(
      "kt-scope-x",
      "body:not(a { color: red }"
    );
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

  test("rejects a comment standing in for a descendant combinator", () => {
    // 注释不是组合符：& 与后续类型选择器之间无实空白/组合符即复合无效
    //（& 不能与类型选择器复合），发射形态会被浏览器静默丢弃，无无效反馈
    const { css, valid } = compileCss("kt-scope-x", "&/*c*/x { color: red }");
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("still rejects an unclosed comment", () => {
    // 未闭合注释无效闸保留（与未闭合字符串同口径）
    const { css, valid } = compileCss(
      "kt-scope-x",
      "& { color: red } /* 未闭合"
    );
    expect(valid).toBe(false);
    expect(css).toBe("");
  });

  test("keeps an escaped trailing plus as selector text, still rejects a bare trailing plus", () => {
    // 转义的 \+ 是选择器文本，不构成尾组合符——用 & 规则形态使该选择器
    // 进入尾组合符闸路径（无 & 的规则走 rest 路径不经过该闸）；裸 & + 仍无效
    expect(compileCss("kt-scope-x", "& .tag\\+ { color: red }").valid).toBe(
      true
    );
    expect(compileCss("kt-scope-x", "& + { color: red }").valid).toBe(false);
  });

  test("treats formfeed and comment placeholder before top-level & as non-boundary", () => {
    // \f 与注释占位不是规则边界：其后的顶层 & 规则必须平铺提取，
    // 且尾组合符闸对它生效
    expect(compileCss("kt-scope-x", "\f& a { color: red }").css).toBe(
      ".kt-scope-x .kt-style-demo a { color: red }"
    );
    // 注释占位使 & 前的注释留在 rest，冲刷为独立规则行——输出两行，
    // 平铺规则行用 toContain 断言（单行 toBe 会因额外的 rest 行失配）
    expect(compileCss("kt-scope-x", "/*c*/& a { color: red }").css).toContain(
      ".kt-scope-x .kt-style-demo a { color: red }"
    );
    expect(compileCss("kt-scope-x", "/*c*/& + { color: red }").valid).toBe(
      false
    );
  });

  test("accepts a css hex escape followed by a terminating newline inside strings", () => {
    // 字符串内 \26<LF> 是完整 hex 转义（LF 即终止空白，输入不留空格以免
    // 空格被消费为终止空白后残留裸换行误触 bad-string 闸）；实现按 raw
    // 原文透传转义序列，断言 raw 形态而非解码结果
    const { css, valid } = compileCss(
      "kt-scope-x",
      '& a { content: "a\\26\nb" }'
    );
    expect(valid).toBe(true);
    expect(css).toContain('"a\\26\nb"');
  });

  test("rejects an unclosed attribute selector", () => {
    // 方括号未闭合：残稿以 valid 外泄会被浏览器静默丢弃
    expect(compileCss("kt-scope-x", "[foo { color: red }").valid).toBe(false);
    expect(compileCss("kt-scope-x", "& [foo] { color: red }").valid).toBe(true);
  });

  test("rejects a trailing combinator inside a media block", () => {
    // 尾组合符闸对任意深度的 & 规则均生效
    expect(
      compileCss("kt-scope-x", "@media screen { & > { color: red } }").valid
    ).toBe(false);
  });

  test("flattens a residual structural & inside the selector to the scope selector", () => {
    // & & a：sel 中残余的结构性 & 替换为 :is(作用域选择器)，不再以
    // 字面量 & 进入最终样式表被浏览器丢弃
    const { css, valid } = compileCss("kt-scope-x", "& & a { color: red }");
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo :is(.kt-scope-x .kt-style-demo) a { color: red }"
    );
  });

  test("keeps an ampersand inside a quoted attribute value as string text", () => {
    // 属性串值内的 & 是字符串文本而非结构性嵌套引用：平铺替换不得改写
    // 串值（[title="a & b"] 语义保持原样），否则规则被静默改写仍 valid
    const { css, valid } = compileCss(
      "kt-scope-x",
      '& [title="a & b"] { color: red }'
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      '.kt-scope-x .kt-style-demo [title="a & b"] { color: red }'
    );
  });

  test("emits self-nested & rule keeping all three declarations in source order", () => {
    // 自嵌套 & 规则的三声明顺序契约锁定（防重构回归）
    const { css, valid } = compileCss(
      "kt-scope-x",
      "& { color: red; background: blue; border: 1px }"
    );
    expect(valid).toBe(true);
    expect(css).toBe(
      ".kt-scope-x .kt-style-demo { color: red; background: blue; border: 1px }"
    );
  });
});

describe("compileCss selector completeness gate", () => {
  test("rejects a top-level & rule whose selector ends in a combinator", () => {
    // 尾组合符（无右操作数）是结构级无效选择器：发射 ".demo >" 形态会被
    // 浏览器静默丢弃而保存闸放行，用户拿不到任何无效反馈——与选择器
    // 列表闸同粒度整份判无效；合法右操作数形态不受影响
    expect(compileCss("kt-scope-x", "& > { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
    expect(compileCss("kt-scope-x", "& + { color: red }").valid).toBe(false);
    expect(compileCss("kt-scope-x", "& ~ { color: red }").valid).toBe(false);
    // 注释占位在尾组合符之后仍以组合符收尾，真实选择器同样无效
    expect(compileCss("kt-scope-x", "& > /*c*/ { color: red }").valid).toBe(
      false
    );
    // 祖先条件里的尾组合符经原生嵌套解析后同样是无右操作数的无效选择器
    // （浏览器静默丢弃），尾组合符闸对任意深度生效——与 & > 顶层形态同判
    expect(compileCss("kt-scope-x", "html.dark & > { color: red }").valid).toBe(
      false
    );
  });

  test("still accepts a combinator with a right operand", () => {
    const { css, valid } = compileCss("kt-scope-x", "& > span { color: red }");
    expect(valid).toBe(true);
    expect(css).toBe(".kt-scope-x .kt-style-demo > span { color: red }");
    const adjacent = compileCss("kt-scope-x", "& + i { color: red }");
    expect(adjacent.valid).toBe(true);
    expect(adjacent.css).toBe(".kt-scope-x .kt-style-demo + i { color: red }");
    // 属性串值以引号收尾，不构成组合符结尾
    const attr = compileCss("kt-scope-x", '&[data-x="a>"] { color: red }');
    expect(attr.valid).toBe(true);
    expect(attr.css).toBe(
      '.kt-scope-x .kt-style-demo[data-x="a>"] { color: red }'
    );
  });
});

describe("compileCss css whitespace and pseudo-fn paren context", () => {
  test("keeps non-breaking spaces at a declaration value edge", () => {
    // U+00A0 非 CSS 空白（属 ident 字符）：声明值边缘的 NBSP 是值的一部
    // 分，裁剪只认 CSS 空白集——发射结果与输入声明值逐字一致，自定义
    // 属性值不被静默篡改
    const { css, valid } = compileCss("kt-scope-x", "& { --x: red\u00a0 }");
    expect(valid).toBe(true);
    expect(css).toContain("--x: red\u00a0");
  });

  test("treats a draft of only non-breaking spaces as non-empty content", () => {
    // 空草稿判断只认 CSS 空白集：纯 NBSP 草稿不是空草稿——按残稿发射
    // （浏览器侧丢弃无效声明），而非静默按空处理
    const { css, valid } = compileCss("kt-scope-x", "\u00a0");
    expect(valid).toBe(true);
    expect(css).not.toBe("");
  });

  test("keeps a non-breaking space as a combinator right operand", () => {
    // 尾组合符判定只剥 CSS 空白：裸 > 后只有 CSS 空白才无右操作数；
    // > 后跟 NBSP（ident 字符）有右操作数，不得误判尾组合符
    expect(compileCss("kt-scope-x", "& >\u00a0 { color: red }").valid).toBe(
      true
    );
    expect(compileCss("kt-scope-x", "& > { color: red }").valid).toBe(false);
  });

  test("accepts & inside parens in declaration values", () => {
    // 声明值内括号中的 & 非结构引用：伪类函数括号闸只认「( 前紧邻 ident
    // 且 ident 前一字元为 :」的括号——& 规则体内声明的括号放行
    const { css, valid } = compileCss(
      "kt-scope-x",
      "& { --tokens: f(&); color: red }"
    );
    expect(valid).toBe(true);
    expect(css).toContain("--tokens: f(&)");
  });

  test("accepts a bare top-level declaration value containing parenthesized &", () => {
    // 顶层 rest 声明（无 & 规则包装）同样按声明值放行——括号语境判定
    // 不依赖花括号深度
    const { css, valid } = compileCss(
      "kt-scope-x",
      "--label: (A&B); color: red"
    );
    expect(valid).toBe(true);
    expect(css).toContain("--label: (A&B)");
  });

  test("keeps a comment separated descendant combinator valid", () => {
    // & 与后续选择器之间有实空白 → 后代组合符成立；注释占位保留 token
    // 分隔（防 .kt-style-demox 错误复合），防回归锁
    const { css, valid } = compileCss("kt-scope-x", "&/*c*/ x { color: red }");
    expect(valid).toBe(true);
    expect(css).toContain(".kt-style-demo/**/ x {");
  });

  test("accepts a pseudo-like function name in a declaration value without space", () => {
    // 声明冒号紧邻函数名（--tokens:f(&)）：f 经解码后不是已知函数式伪类
    // 名——伪类函数括号闸按解码函数名集合判定，声明值语境放行（与冒号
    // 后带空格的形态同判）
    const { css, valid } = compileCss(
      "kt-scope-x",
      "& { --tokens:f(&); color: red }"
    );
    expect(valid).toBe(true);
    expect(css).toContain("--tokens:f(&)");
  });

  test("treats an escaped pseudo function spelling like its plain form", () => {
    // :i\73( 解码为 :is(：转义拼写与普通拼写适用同一预览策略（unsupported）
    expect(compileCss("kt-scope-x", "body:i\\73(&) { color: red }").valid).toBe(
      false
    );
  });

  test("treats an escaped spelling with terminating whitespace the same", () => {
    // i\73 与 ( 之间的单个空白是转义终止空白，属转义体：须与无空白拼写
    // 同裁决（unsupported）——漏跳则此形走中缀路径被放行，双裁决不一致
    expect(
      compileCss("kt-scope-x", "body:i\\73 (&) { color: red }").valid
    ).toBe(false);
  });

  test("keeps two escaped spellings concatenated before the paren valid", () => {
    // i\73 \74 的两转义体间空白不在 ident 字符类内：反向扫描在此截断，
    // 前置冒号核验早退，名集比对不可达——不识别为伪类函数括号（护栏）
    expect(
      compileCss("kt-scope-x", "body:i\\73 \\74 (&) { color: red }").valid
    ).toBe(true);
  });

  test("keeps a real whitespace separator before the paren valid", () => {
    // 双空白＝转义体之后的真分隔符：ident 边界在此截断，不识别为伪类
    // 函数括号（护栏，非红测）
    expect(
      compileCss("kt-scope-x", "body:i\\73  (&) { color: red }").valid
    ).toBe(true);
  });
});

describe("compileCss escaped ident scan cost", () => {
  test("compiles a long escaped identifier without quadratic rescanning", () => {
    // 转义 ident 须一次推进到 ident.end：逐字符回退会对重叠后缀重复解析，
    // 长转义 ident 呈二次开销（本尺寸在回退实现下实测 ~135s，单遍推进后
    // 线性完成）。红机制=测试内墙上时间断言（线性实现耗时毫秒级，2s 上限
    // 留 100 倍余量，避开外部计时器接管差异）
    const ident = "a\\-b".repeat(24000);
    const start = Date.now();
    const { css, valid } = compileCss(
      "kt-scope-x",
      `& ${ident} { color: red }`
    );
    expect(Date.now() - start).toBeLessThan(2000);
    expect(valid).toBe(true);
    expect(css).toContain("a\\-b");
  });
});

describe("compileCss unsupported gating precedence", () => {
  test("rejects a structurally broken draft even when a pseudo-fn amp precedes the damage", () => {
    // 伪类函数括号内的 & 只登记旗标、不早退：预扫描必须完成全部结构校验，
    // 未闭合花括号等结构残稿判 syntax（浏览器同样拒绝、用户无反馈的残稿
    // 不得以 unsupported"可保存不预览"形态外泄）
    expect(compileCss("kt-scope-x", "body:is(&) { color: red")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });

  test("reports syntax damage over unsupported when a draft hits both flags", () => {
    // 语法残损旗标（尾组合符）与语义受限旗标（选择器列表）同稿并存：
    // syntax 优先返回——发射形态会被浏览器整规则静默丢弃，unsupported
    // 只留给结构完整但语义受限的输入
    expect(
      compileCss("kt-scope-x", "& > { color: red } &, body { color: blue }")
    ).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });

  test("reports syntax for a single candidate combining a selector list and a trailing combinator", () => {
    // 单候选同中两旗（顶层逗号＋成员尾组合符）不得因逗号分支短路尾组合
    // 符评估而漏判：", body >" 成员无右操作数，浏览器对无效选择器列表整
    // 规则静默丢弃，须判 syntax 拒绝保存
    expect(compileCss("kt-scope-x", "&, body > { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });

  test("reports syntax when any list member compounds & with a type-ish token", () => {
    // 成员级复合同判：首成员 &x 直接毗邻（&x , body）与次成员 &x（&, &x）
    // 均使整列表被浏览器静默丢弃——& 与类型性记号直接复合的判定不因
    // 逗号分支短路而缺席
    expect(compileCss("kt-scope-x", "&x , body { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
    expect(compileCss("kt-scope-x", "&, &x { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });

  test("keeps a structurally complete pseudo-fn amp draft unsupported", () => {
    // 结构完整的伪类-& 稿维持 unsupported（可保存不预览）语义不回退
    expect(compileCss("kt-scope-x", "body:is(&) { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "unsupported",
    });
  });

  test("keeps a selector-list draft without syntax damage unsupported", () => {
    // 无结构残损的选择器列表稿维持 unsupported 语义不回退
    expect(compileCss("kt-scope-x", "&, body { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "unsupported",
    });
  });
});

describe("compileCss cross-delimiter pairing", () => {
  test("rejects cross-closed brace inside bracket", () => {
    // { [ } ]：三独立计数器各自归零会漏判；定界符栈核交叉闭合
    expect(compileCss("kt-scope-x", "{ [ } ]")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });
  test("rejects cross-closed paren-bracket sequence", () => {
    // ([)]：) 在栈顶为 [ 时到达，栈顶错配即拒——交叉闭合同样漏判形态
    expect(compileCss("kt-scope-x", "--tokens: ([)]; color: red")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });
  test("keeps rejecting a surplus closing paren inside a bracket block", () => {
    // 保守契约延续锁：独立 ) 现码已拒（负值即判），修后由栈顶错配同判——
    // 现码语义延续锁（现码已拒，绿态为正确面）
    expect(compileCss("kt-scope-x", "[)] { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });
  test("keeps rejecting a bracket closed by paren", () => {
    // 现码语义延续锁：] 使 bracketDepth 变负即判，现码已拒
    expect(compileCss("kt-scope-x", "(]")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });
  test("keeps nested same-kind delimiters valid", () => {
    // 护栏：合法嵌套不误伤（配平草稿保持 valid:true，按残稿透传口径
    // 原文发射，不判 css 为空）
    expect(compileCss("kt-scope-x", "([])").valid).toBe(true);
    // 护栏：括号块内含闭括号 token 合法
    expect(compileCss("kt-scope-x", "[a] { color: red }").valid).toBe(true);
  });
  test("keeps the declaration-value bracket counterexample invalid by IEOF", () => {
    // IEOF 契约锁：([)] 的 ( 块至 EOF 未闭合，浏览器整份拒绝——现码三
    // 计数器恰好归零漏判为 valid:true，栈顶错配修后即拒；与
    // --tokens: ([)]; 同形（规则体内形态）
    expect(compileCss("kt-scope-x", "& { --x: ([)] }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });
  test("keeps a truly balanced paren-bracket sequence valid", () => {
    // ( [ ] ) 完整嵌套闭合，浏览器接受形态不误伤
    expect(compileCss("kt-scope-x", "& { --x: ([ ] ) }").valid).toBe(true);
  });
});

describe("compileCss nth pseudo function amp gate", () => {
  test("rejects an amp inside nth-child of-selector", () => {
    // :nth-child(2 of &.x) 与 :has( 同族异名：函数式伪类参数内 & 闸须覆盖
    expect(
      compileCss("kt-scope-x", "li:nth-child(2 of &.x) { color: red }").valid
    ).toBe(false);
  });
  test("keeps plain An+B nth-child valid", () => {
    expect(
      compileCss("kt-scope-x", "li:nth-child(2n+1) { color: red }").valid
    ).toBe(true);
  });
  test("keeps of-selector without amp valid", () => {
    expect(
      compileCss("kt-scope-x", "li:nth-child(2 of .a) { color: red }").valid
    ).toBe(true);
  });
});

describe("compileCss unclosed candidate head gates", () => {
  test("reports unsupported for a selector list in an unclosed candidate", () => {
    // 候选 { 后又遇 {（内层块）时整体不进入平铺提取，但顶层逗号闸对任意
    // & 候选均须生效：列表成员经原生嵌套后脱离卡片作用域策略，与已闭合
    // 候选 "&, body" 的 unsupported 同判
    expect(compileCss("kt-scope-x", "&, body { a { b } }")).toEqual({
      css: "",
      valid: false,
      reason: "unsupported",
    });
  });
  test("reports syntax for a dangling combinator in an unclosed candidate", () => {
    // 尾组合符无右操作数：发射形态被浏览器静默丢弃而 valid 放行，用户
    // 拿不到任何无效反馈——unclosed 候选与已闭合候选 "& >" 同判 syntax
    expect(compileCss("kt-scope-x", "& > { a { b } }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });
  test("keeps a legal unclosed candidate head free of gate misfires", () => {
    // 合法嵌套 head 无顶层逗号/尾组合符：闸补跑不得误伤原生嵌套场景
    expect(compileCss("kt-scope-x", "& { a { color: red } }").valid).toBe(true);
    expect(compileCss("kt-scope-x", "& a { b { color: red } }").valid).toBe(
      true
    );
  });
});

describe("compileCss selector list member trailing combinator", () => {
  test("reports syntax when any list member ends in a combinator", () => {
    // 尾组合符评估须逐成员：整段判定只看列表末字符，"& >" 成员无右操作
    // 数、浏览器对无效选择器列表整规则静默丢弃，syntax-first 契约下与
    // "&, body >" 同判 syntax（不可保存），unsupported 的可保存语义不适用
    expect(compileCss("kt-scope-x", "& >, body { color: red }")).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
  });
  test("keeps member splitting paren-depth aware", () => {
    // 成员拆分须括号深度感知：函数式伪类参数内逗号不是成员分隔符，
    // &:is(.a,.b) 不得被误拆出尾组合符形态
    expect(compileCss("kt-scope-x", "&:is(.a,.b) { color: red }").valid).toBe(
      true
    );
  });
});

describe("compileCss escaped pseudo spelling chains", () => {
  test("treats chained hex-escaped spellings as a pseudo function name", () => {
    // 连续 hex 转义（\69 \73）逐转义体链式回退：反向扫描须越过每个转义体
    // 的终止空白继续取 ident，双空白才是真分隔符——与 "is" 普通拼写同判，
    // & 判伪类参数内结构引用（unsupported），不得漏判成中缀放行
    expect(compileCss("kt-scope-x", "body:\\69 \\73 (&){color:red}")).toEqual({
      css: "",
      valid: false,
      reason: "unsupported",
    });
  });
});

describe("compileCss escaped punctuation as selector content", () => {
  test("keeps an escaped-universal-selector amp rule native-nested", () => {
    // 字符串外转义对在掩码副本中为非空白哨兵：& 左侧存在祖先选择器文本，
    // 按中缀 & 保留原生嵌套——不得把转义对当可跳过占位、误判顶层起点
    // 平铺成无条件规则
    expect(compileCss("kt-scope-x", "\\* & { color: red }")).toEqual({
      css: ".kt-scope-x .kt-style-demo { \\* & { color: red } }",
      valid: true,
    });
  });
  test("keeps an escaped punctuation ident prefix mid-selector", () => {
    // 转义标点构成祖先选择器文本：& 保留中缀语义，祖先条件经原生嵌套生效
    expect(compileCss("kt-scope-x", ".x\\: & { color: red }")).toEqual({
      css: ".kt-scope-x .kt-style-demo { .x\\: & { color: red } }",
      valid: true,
    });
  });
});
