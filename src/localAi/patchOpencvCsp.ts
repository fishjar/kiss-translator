import type { Plugin } from "vite";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// opencv / ORT 的 Emscripten/embind 胶水代码会调用 new Function(...)，扩展 CSP
// （script-src 'self' 'wasm-unsafe-eval'）以 EvalError 拒绝它：
//   - 主线程：options 页启动即崩（#root 为空）；
//   - 各 worker（ASR/TTS/OCR/LLM）：加载或推理时崩溃。
// 网页目标无 CSP 限制，所以此前从未暴露。本插件把所有 new Function 站点换成
// 等价的无 eval 实现，保证双目标产物在扩展 CSP 下可用。
// 补丁时机：① transform（opencv 源文件）② generateBundle（bundle 内 chunk/资产）
// ③ closeBundle 扫描 Vite 产物和复制的静态 WASM 资源。
//
// 三类站点：
//   A. embind createNamedFunction / createDynCaller（静态字符串拼接生成函数）
//      —— 按固定版本的源码做精确字符串替换（升级依赖后必须重新推导，否则报错）。
//   B. embind 方法调用生成器 new Function(Object.keys(X), Y)(...Object.values(X))
//      —— 压缩后变量名各文件不同，用正则捕获变量名 + 通用解释器（解析出 4 种
//      固定函数体形状后以 apply/new 展开执行）。
//   C. 新 embind（ORT 1.24.3）动态函数生成 new_(Function, names).apply(null, values)
//      —— 语义同 new Function(...names)(...values)，但参数/函数体分离，旧 B 类
//      正则不匹配。函数体只有 2 种固定模板（craftInvokerFunction /
//      __emval_get_method_caller），用通用解释器解析函数体字符串后以静态闭包
//      等价构造（names/values 数组本身被正则捕获，与压缩名无关）。
//
// 版本锚点：
//   - @techstark/opencv-js@4.10.0-release.1 dist/opencv.js（旧 embind，A 类 2 处）
//   - @paddleocr/paddleocr-js@0.4.2 dist/assets/worker-entry-*.js（新 embind，A 2 处 + B 1 处 + C 2 处）
//   - onnxruntime-web（wasm 胶水 + 各 worker 内嵌副本，B 类）
//   - ORT 内嵌副本随 SDK worker / options 主包分发（C 类）

type Pair = readonly [string, string];

// 注：不能给生成的匿名函数赋 .name —— Function#name 不可写（strict 模式抛 TypeError）。
// 代价：embind 错误类的 .name 退化为压缩后的变量名（仅影响堆栈可读性，不影响功能）。
export const NAMED_MAIN: Pair = [
  `return new Function("body","return function "+name+"() {\\n"+'    "use strict";'+"    return body.apply(this, arguments);\\n"+"};\\n")(body)`,
  "var __nf=function(){return body.apply(this,arguments)};return __nf",
];
export const NAMED_WORKER: Pair = [
  `return new Function("body", "return function " + name + '() {\\n    "use strict";    return body.apply(this, arguments);\\n};\\n\')(body);`,
  "var __nf=function(){return body.apply(this,arguments)};return __nf;",
];
export const DYSCALL_MAIN: Pair = [
  `return new Function("dynCall","rawFunction",body)(dynCall,rawFunction)`,
  "return (function(dc,rf,nn){return function(){var __a=[rf];for(var __i=0;__i<nn;++__i){__a.push(arguments[__i])}return dc.apply(null,__a)}})(dynCall,rawFunction,args.length)",
];
export const DYSCALL_WORKER: Pair = [
  `return new Function("dynCall", "rawFunction", body)(dynCall, rawFunction);`,
  "return (function(dc,rf,nn){return function(){var __a=[rf];for(var __i=0;__i<nn;++__i){__a.push(arguments[__i])}return dc.apply(null,__a)}})(dynCall, rawFunction, args.length);",
];

// B 类：匹配 embind 方法调用生成器（含 ORT .mjs 里 (new Function(...))(...) 的括号变体）。
// 括号变体开头的 ( 必须一并纳入匹配：\)? 会吞掉 new Function(...) 的外层配对 )，
// 若开头的 ( 留在匹配外，替换串括号不平衡 → 产物出现 Unexpected token 语法错误。
// 注意：压缩器（esbuild/rollup）会生成含 $ 的标识符（如 $A、_A），必须用 [\w$]+ 而非 \w+。
export const METHOD_CALLER_RE =
  /(\(\s*)?new Function\(Object\.keys\(([\w$]+)\),\s*([\w$]+)\)\)?\s*\(\.\.\.Object\.values\(\s*\2\s*\)\)/g;

// 无 eval 解释器：解析 embind 生成的 4 种固定函数体形状，用 apply/new 展开执行。
// 入参 d = embind 依赖对象（toValue/argFromPtrN/getStringOrSymbol/emval_returnValue/...），
// b = 生成的函数体源码字符串。
const METHOD_CALLER_INTERPRETER = [
  "(function (d, b) {",
  "var s = b, o = s.indexOf(\"{\"), c = s.lastIndexOf(\"}\");",
  "var inner = s.slice(o + 1, c).replace(/^\\s*return\\s+/, \"\").trim();",
  "var wrapped = false;",
  "var mw = inner.match(/^emval_returnValue\\s*\\(\\s*toReturnWire\\s*,\\s*destructorsRef\\s*,\\s*(.+)\\)\\s*$/);",
  "if (mw) { wrapped = true; inner = mw[1].trim(); }",
  "var mode = 3, list = \"\";",
  "var m1 = inner.match(/^toValue\\s*\\(\\s*handle\\s*\\)\\s*\\[\\s*getStringOrSymbol\\s*\\(\\s*methodName\\s*\\)\\s*\\]\\s*\\((.*)\\)$/);",
  "var m2 = inner.match(/^new\\s+\\(\\s*toValue\\s*\\(\\s*handle\\s*\\)\\s*\\)\\s*\\((.*)\\)$/);",
  "var m3 = inner.match(/^toValue\\s*\\(\\s*handle\\s*\\)\\s*\\((.*)\\)$/);",
  "if (m1) { mode = 1; list = m1[1]; } else if (m2) { mode = 2; list = m2[1]; } else if (m3) { mode = 0; list = m3[1]; }",
  "else {",
  "var m4 = inner.match(/^\\((.*)\\)$/);",
  "if (!m4) throw new Error(\"kiss-ai: unrecognized embind method caller body\");",
  "list = m4[1];",
  "}",
  "var specs = [];",
  "if (list.trim()) {",
  "var parts = list.split(\",\");",
  "for (var i = 0; i < parts.length; i++) {",
  "var mm = parts[i].trim().match(/^argFromPtr(\\d+)\\s*\\(\\s*args(?:\\s*\\+\\s*(\\d+))?\\s*\\)$/);",
  "if (!mm) throw new Error(\"kiss-ai: unrecognized embind arg expression: \" + parts[i]);",
  "specs.push([+mm[1], +(mm[2] || 0)]);",
  "}",
  "}",
  "return function (handle, methodName, destructorsRef, args) {",
  "var ca = [], i, v;",
  "for (i = 0; i < specs.length; i++) ca.push(d[\"argFromPtr\" + specs[i][0]](args + specs[i][1]));",
  "if (mode === 1) { var obj = d.toValue(handle); v = obj[d.getStringOrSymbol(methodName)].apply(obj, ca); }",
  "else if (mode === 2) v = new (d.toValue(handle))(...ca);",
  "else if (mode === 0) v = d.toValue(handle).apply(null, ca);",
  "else v = ca[ca.length - 1];",
  "return wrapped ? d.emval_returnValue(d.toReturnWire, destructorsRef, v) : v;",
  "};",
  "}",
].join("\n");

// 供测试直接调用（Node 环境无 CSP，new Function 合法）。
// 注：INTERP 自带开头 "("、缺收尾 ")"，这里补一个 ")" 成完整表达式。
export const __kissMcInterp: (d: any, b: string) => any = new Function(
  "return " + METHOD_CALLER_INTERPRETER + ")"
)();

// C 类：匹配 embind 动态函数生成（可读与压缩形态同形，仅变量名不同）：
//   new_(Function, names).apply(null, values)  ≡  new Function(...names)(...values)
//   注意：压缩后变量名常含 $（如 Hi(Function,$A).apply(null,tI)），必须用 [\w$]+ 匹配。
export const NEW_FN_CALLER_RE =
  /([\w$]+)\(Function\s*,\s*([\w$]+)\)\.apply\(\s*([\w$]+)\s*,\s*([\w$]+)\s*\)/g;

export function hasNewFnCaller(code: string): boolean {
  return new RegExp(NEW_FN_CALLER_RE.source).test(code);
}

// 无 eval 解释器：names = [参数名..., 函数体]，values 与参数名一一对应。
// 函数体只有 2 种固定模板，按语句形状解析后以静态闭包构造等价函数：
//   A. craftInvokerFunction：wasm 调用器（toWireType 接线 + invoker(fn, ...) + 析构）
//   B. __emval_get_method_caller：emval 方法调用器（readValueFromPointer + handle[name](...)）
// 返回函数体 `return function ...` 的求值结果（内层函数本身）。
const NEW_FN_INTERPRETER = [
  "(function (names, values) {",
  "var env = {};",
  "for (var i = 0; i < names.length - 1; i++) env[names[i]] = values[i];",
  "var b = String(names[names.length - 1]);",
  "var m = b.match(/^return function [^\\s(]+\\(([^)]*)\\)\\s*\\{([\\s\\S]*)\\}\\s*;?\\s*$/);",
  "if (!m) throw new Error(\"kiss-ai: unrecognized embind dynamic function body\");",
  "var params = m[1].trim() ? m[1].split(\",\").map(function (s) { return s.trim(); }) : [];",
  "var code = m[2];",
  "var f, lines, L, mm;",
  "var isEmval = params.length === 4 && params[0] === \"handle\" && params[1] === \"name\" && params[2] === \"destructors\" && params[3] === \"args\";",
  "if (isEmval) {",
  "var rvp = [], del = [], hasRet = false;",
  "lines = code.split(\"\\n\");",
  "for (i = 0; i < lines.length; i++) {",
  "L = lines[i].trim();",
  "if (!L) continue;",
  "mm = null;",
  "if ((mm = L.match(/^var (arg\\d+) = (argType\\d+)\\.readValueFromPointer\\(args(?:\\s*\\+\\s*(\\d+))?\\);$/))) {",
  "rvp.push([+mm[1].slice(3), env[mm[2]], mm[3] ? +mm[3] : 0]);",
  "continue;",
  "}",
  "if (L === \"var rv = handle[name]()\" || (mm = L.match(/^var rv = handle\\[name\\]\\(([^)]*)\\);$/))) continue;",
  "if ((mm = L.match(/^(argType\\d+)\\.deleteObject\\((arg\\d+)\\);$/))) {",
  "del.push([env[mm[1]], +mm[2].slice(3)]);",
  "continue;",
  "}",
  "if (L === \"return retType.toWireType(destructors, rv);\") { hasRet = true; continue; }",
  "throw new Error(\"kiss-ai: unrecognized emval caller line: \" + L);",
  "}",
  "f = function (handle, name, destructors, args) {",
  "var avs = [], k;",
  "for (k = 0; k < rvp.length; k++) avs.push(rvp[k][1].readValueFromPointer(args + rvp[k][2]));",
  "var rv = handle[name].apply(handle, avs);",
  "for (k = 0; k < del.length; k++) del[k][0].deleteObject(avs[del[k][1]]);",
  "if (hasRet) return env.retType.toWireType(destructors, rv);",
  "};",
  "} else {",
  "var n = params.length, human = \"\", dtorStack = false, isClass = false, ret = false, finalRet = false;",
  "var at = [], dts = [], exp = [], got = [], k, v;",
  "lines = code.split(\"\\n\");",
  "i = 0;",
  "while (i < lines.length && !lines[i].trim()) i++;",
  "if (lines[i] === \"if (arguments.length !== \" + n + \") {\") {",
  "var tm = (lines[i + 1] || \"\").match(/^throwBindingError\\('function (.*) called with '/);",
  "if (tm) human = tm[1];",
  "if ((lines[i + 2] || \"\").trim() !== \"}\") throw new Error(\"kiss-ai: unexpected invoker arity block\");",
  "i += 3;",
  "}",
  "for (; i < lines.length; i++) {",
  "L = lines[i].trim();",
  "if (!L) continue;",
  "mm = null;",
  "if (L === \"var destructors = [];\") { dtorStack = true; continue; }",
  "if ((mm = L.match(/^var thisWired = classParam\\.toWireType\\(\\w+, this\\);$/))) { isClass = true; continue; }",
  "if ((mm = L.match(/^var (arg(\\d+)Wired) = (argType\\d+)\\.toWireType\\(\\w+, arg\\2\\);( \\/\\/ .*)?$/))) { at.push(env[mm[3]]); continue; }",
  "if ((mm = L.match(/^(var rv = )?invoker\\(fn([^)]*)\\);$/))) {",
  "ret = !!mm[1];",
  "exp = [];",
  "if (isClass) exp.push(\"thisWired\");",
  "for (k = 0; k < at.length; k++) exp.push(\"arg\" + k + \"Wired\");",
  "got = mm[2].replace(/^\\s*,\\s*/, \"\").trim() ? mm[2].replace(/^\\s*,\\s*/, \"\").split(\",\").map(function (s) { return s.trim(); }) : [];",
  "if (got.length !== exp.length) throw new Error(\"kiss-ai: invoker call list mismatch\");",
  "continue;",
  "}",
  "if (L === \"runDestructors(destructors);\") continue;",
  "if ((mm = L.match(/^(\\w+)_dtor\\(\\1\\);( \\/\\/ .*)?$/))) { dts.push(mm[1]); continue; }",
  "if (L === \"var ret = retType.fromWireType(rv);\") { finalRet = true; continue; }",
  "if (L === \"return ret;\") continue;",
  "throw new Error(\"kiss-ai: unrecognized embind invoker line: \" + L);",
  "}",
  "f = function () {",
  "if (arguments.length !== n) env.throwBindingError('function ' + human + ' called with ' + arguments.length + ' arguments, expected ' + n + ' args!');",
  "var destructors = [];",
  "var thisWired;",
  "if (isClass) thisWired = env.classParam.toWireType(dtorStack ? destructors : null, this);",
  "var wired = [];",
  "for (k = 0; k < at.length; k++) wired.push(at[k].toWireType(dtorStack ? destructors : null, arguments[k]));",
  "var ca = [env.fn];",
  "if (isClass) ca.push(thisWired);",
  "for (k = 0; k < wired.length; k++) ca.push(wired[k]);",
  "var rv;",
  "if (ret) rv = env.invoker.apply(null, ca); else env.invoker.apply(null, ca);",
  "if (dtorStack) env.runDestructors(destructors);",
  "else for (k = 0; k < dts.length; k++) {",
  "v = dts[k] === \"thisWired\" ? thisWired : wired[+dts[k].replace(\"Wired\", \"\").slice(3)];",
  "env[dts[k] + \"_dtor\"](v);",
  "}",
  "if (finalRet) return env.retType.fromWireType(rv);",
  "};",
  "}",
  "return f;",
  "}",
].join("\n");

// 供测试直接调用。注：同 B 类，字符串自带开头 "("、缺收尾 ")"，补 ")" 成完整表达式。
export const __kissNewFnInterp: (names: any[], values: any[]) => any = new Function(
  "return " + NEW_FN_INTERPRETER + ")"
)();

function applyPairs(code: string, pairs: readonly Pair[]): string {
  let out = code;
  for (const [from, to] of pairs) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function patchMethodCallers(code: string): string {
  if (!code.includes("new Function(")) return code;
  const re = new RegExp(METHOD_CALLER_RE.source, "g");
  // 替换串必须是净括号 0：INTERP 自带开头 "("、缺收尾 ")"（净 +1），
  // 故拼成 "INTERP)(x,y)"（补 1 个 ")" + 1 对调用括号，净 0），与匹配跨度（净 0）平衡。
  return code.replace(
    re,
    (_m, _lead: string | undefined, x: string, y: string) =>
      `${METHOD_CALLER_INTERPRETER})(${x},${y})`
  );
}

// C 类：把 new_(Function, names).apply(null, values) 换成内联解释器调用。
function patchNewFnCallers(code: string): string {
  if (!hasNewFnCaller(code)) return code;
  const re = new RegExp(NEW_FN_CALLER_RE.source, "g");
  return code.replace(
    re,
    (_m, _x: string, names: string, _thisArg: string, values: string) =>
      `${NEW_FN_INTERPRETER})(${names},${values})`
  );
}

// 完整补丁管线（A 类精确串 + B 类正则 + C 类解释器），供产物扫描使用。
// publicAssets 钩子共用。
export function patchCspCode(code: string): string {
  if (!code.includes("new Function(") && !hasNewFnCaller(code)) return code;
  const allPairs: readonly Pair[] = [NAMED_MAIN, DYSCALL_MAIN, NAMED_WORKER, DYSCALL_WORKER];
  return patchNewFnCallers(patchMethodCallers(applyPairs(code, allPairs)));
}

export function patchOpencvCsp(): Plugin {
  let outDir: string | null = null;
  const STUB_ID = "\0opencv-node-builtin-stub";
  return {
    name: "kiss-ai-patch-opencv-csp",
    enforce: "pre",
    configResolved(config) {
      outDir = config.build?.outDir ?? null;
    },
    resolveId(id, importer) {
      // opencv.js (Emscripten) 含仅在 Node 分支执行的 require("fs"|"path"|"crypto")；
      // 在 pre 阶段接管为空模块，消除 vite:resolve 的 browser externalized 黄色警告。
      if (
        (id === "fs" || id === "path" || id === "crypto") &&
        importer?.includes("opencv-js")
      ) {
        return STUB_ID;
      }
    },
    load(id) {
      if (id === STUB_ID) return "export default {};";
    },
    transform(code, id) {
      if (!id.includes("opencv-js") || !id.includes("opencv.js")) return;
      // 代理模块（?commonjs-es-import 等）不含真实代码，真实文件另行处理
      if (!code.includes("new Function(")) return;
      if (code.includes(NAMED_MAIN[0]) || code.includes(DYSCALL_MAIN[0])) {
        return { code: applyPairs(code, [NAMED_MAIN, DYSCALL_MAIN]), map: null };
      }
      throw new Error(
        "[patch-opencv-csp] opencv.js 未找到已知的 new Function 站点（@techstark/opencv-js 版本变了？请重新推导替换串）"
      );
    },
    generateBundle(_opts, bundle) {
      for (const item of Object.values(bundle)) {
        let code: string | null = null;
        if (item.type === "chunk") code = item.code;
        else if (
          item.type === "asset" &&
          /\.m?js$/.test(item.fileName) &&
          (typeof item.source === "string" || Buffer.isBuffer(item.source))
        ) {
          code =
            typeof item.source === "string"
              ? item.source
              : Buffer.from(item.source as Buffer).toString("utf8");
        }
        if (code === null) continue;
        let patched = code;
        if (/worker-entry-.*\.js$/.test(item.fileName)) {
          if (
            !patched.includes(NAMED_WORKER[0]) ||
            !patched.includes(DYSCALL_WORKER[0])
          ) {
            throw new Error(
              `[patch-opencv-csp] ${item.fileName} 未找到 embind 静态 new Function 站点（@paddleocr/paddleocr-js 版本变了？请重新推导替换串）`
            );
          }
          patched = applyPairs(patched, [NAMED_WORKER, DYSCALL_WORKER]);
        }
        patched = patchMethodCallers(patched);
        patched = patchNewFnCallers(patched);
        if (
          /[\w$]+\(Function\s*,/.test(patched) ||
          patched.includes("new Function(")
        ) {
          throw new Error(
            `[patch-opencv-csp] ${item.fileName} 补丁后仍残留动态 Function 调用（请检查正则或依赖版本）`
          );
        }
        if (patched !== code) {
          if (item.type === "chunk") item.code = patched;
          else (item as { source: string }).source = patched;
        }
      }
    },
    closeBundle() {
      // worker 由 Vite 嵌套构建产出、.mjs 资产/公域文件不进父 bundle，
      // 统一在 outDir 做磁盘兜底扫描，把残留 new Function 站点全部补丁。
      if (!outDir) return;
      const files: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
        }
      };
      if (existsSync(outDir)) walk(outDir);
      for (const p of files) {
        const code = readFileSync(p, "utf8");
        if (!code.includes("new Function(") && !hasNewFnCaller(code)) continue;
        writeFileSync(p, patchCspCode(code));
        console.error(`[patch-opencv-csp] disk-patched ${path.relative(outDir, p)}`);
      }
    },
  };
}
