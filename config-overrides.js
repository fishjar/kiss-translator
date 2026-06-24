const paths = require("react-scripts/config/paths");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserPlugin = require("terser-webpack-plugin");
// const webpack = require("webpack");

console.log("process.env.REACT_APP_CLIENT", process.env.REACT_APP_CLIENT);

// 方案 A：浏览器扩展的 Webpack 覆盖配置 (Popup, Options, Background, Content Scripts)
const extWebpack = (config, env) => {
  const isEnvProduction = env === "production";
  // 生产环境下 HTML 及 JS/CSS 压缩选项
  const minify = isEnvProduction && {
    removeComments: true,
    collapseWhitespace: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    removeEmptyAttributes: true,
    removeStyleLinkTypeAttributes: true,
    keepClosingSlash: true,
    minifyJS: true,
    minifyCSS: true,
    minifyURLs: true,
  };
  // 需要在默认 react-scripts 中被排除替换的插件类名
  const names = [
    "HtmlWebpackPlugin",
    "WebpackManifestPlugin",
    "MiniCssExtractPlugin",
  ];

  // 1. 定义扩展程序的多入口打包策略，避免多处散装注入
  config.entry = {
    popup: paths.appSrc + "/popup.js", // 扩展弹出页面
    options: paths.appSrc + "/options.js", // 扩展设置页面
    background: paths.appSrc + "/background.js", // 扩展后台常驻脚本
    content: paths.appSrc + "/content.js", // 内容注入核心脚本
    "injector-subtitle": paths.appSrc + "/injector-subtitle.js", // 字幕注入脚本
    "injector-shadowroot": paths.appSrc + "/injector-shadowroot.js", // ShadowRoot 拦截注入脚本
  };

  // 2. 将输出的文件命名重写为固定格式，方便 manifest.json 静态引用，防止文件哈希化导致引用失效
  config.output.filename = "[name].js";
  config.output.assetModuleFilename = "media/[name][ext]";

  // REVIEW: 在 Webpack 5 环境下只设置 default: false 依然有触发 vendors 分包切片的可能，更安全的做法是直接设为 false 或显式清空 vendors 缓存组
  config.optimization.splitChunks = { cacheGroups: { default: false } };
  config.optimization.runtimeChunk = false; // 禁用 runtime 独立分包

  // 3. 过滤掉原本 react-scripts 针对单页应用的插件实例
  config.plugins = config.plugins.filter(
    (plugin) => !names.includes(plugin.constructor.name)
  );

  // 4. 重新注入为扩展程序定制的配置
  config.plugins.push(
    // 为设置页定制生成对应的 HTML
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["options"],
      template: paths.appHtml,
      filename: "options.html",
      minify,
    }),
    // 为弹出菜单定制生成对应的 HTML
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["popup"],
      template: paths.appHtml,
      filename: "popup.html",
      minify,
    }),
    new WebpackManifestPlugin({
      fileName: "asset-manifest.json",
    }),
    new MiniCssExtractPlugin({
      filename: "css/[name].css",
    })
  );

  return config;
};

// 方案 B：油猴脚本 (Userscript) 编译覆盖配置
const userscriptWebpack = (config, env) => {
  // 定义油猴脚本特有的 Meta 元数据头部信息 banner
  // REVIEW: @connect 声明中 generativelanguage.googleapis.com 出现了两次，建议删除一行冗余配置。
  const banner = `// ==UserScript==
// @name          ${process.env.REACT_APP_NAME}
// @namespace     ${process.env.REACT_APP_HOMEPAGE}
// @version       ${process.env.REACT_APP_VERSION}
// @description   A simple bilingual translation extension & Greasemonkey script (一个简约的双语对照翻译扩展 & 油猴脚本)
// @author        Gabe<yugang2002@gmail.com>
// @homepageURL   ${process.env.REACT_APP_HOMEPAGE}
// @license       GPL-3.0
// @match         *://*/*
// @icon          ${process.env.REACT_APP_LOGOURL}
// @downloadURL   ${process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}
// @updateURL     ${process.env.REACT_APP_USERSCRIPT_DOWNLOADURL}
// @grant         GM.xmlHttpRequest
// @grant         GM_xmlhttpRequest
// @grant         GM.registerMenuCommand
// @grant         GM_registerMenuCommand
// @grant         GM.unregisterMenuCommand
// @grant         GM_unregisterMenuCommand
// @grant         GM.setValue
// @grant         GM_setValue
// @grant         GM.getValue
// @grant         GM_getValue
// @grant         GM.deleteValue
// @grant         GM_deleteValue
// @grant         GM.info
// @grant         GM_info
// @grant         unsafeWindow
// @connect       translate.googleapis.com
// @connect       translate-pa.googleapis.com
// @connect       generativelanguage.googleapis.com
// @connect       api.cognitive.microsofttranslator.com
// @connect       api-edge.cognitive.microsofttranslator.com
// @connect       edge.microsoft.com
// @connect       bing.com
// @connect       api-free.deepl.com
// @connect       api.deepl.com
// @connect       www2.deepl.com
// @connect       api.openai.com
// @connect       generativelanguage.googleapis.com
// @connect       openai.azure.com
// @connect       workers.dev
// @connect       github.io
// @connect       github.com
// @connect       api.github.com
// @connect       githubusercontent.com
// @connect       kiss-translator.rayjar.com
// @connect       ghproxy.com
// @connect       dav.jianguoyun.com
// @connect       fanyi.baidu.com
// @connect       transmart.qq.com
// @connect       niutrans.com
// @connect       api.ephone.ai
// @connect       ephone.ai
// @connect       translate.volcengine.com
// @connect       dict.youdao.com
// @connect       api.anthropic.com
// @connect       api.deepseek.com
// @connect       opencode.ai
// @connect       api.siliconflow.cn
// @connect       api.xiaomimimo.com
// @connect       dashscope.aliyuncs.com
// @connect       api.cerebras.ai
// @connect       open.bigmodel.cn
// @connect       api.cloudflare.com
// @connect       openrouter.ai
// @connect       localhost
// @connect       127.0.0.1
// @run-at        document-end
// ==/UserScript==

`;

  const names = ["HtmlWebpackPlugin"];

  // 配置油猴多入口：主程序、独立的 options 设置页以及油猴桥接脚本
  config.entry = {
    main: paths.appIndexJs,
    options: paths.appSrc + "/options.js",
    "kiss-translator.user": paths.appSrc + "/userscript.js",
  };

  config.output.filename = "[name].js";
  config.output.publicPath = env === "production" ? "./" : "/";
  config.optimization.splitChunks = { cacheGroups: { default: false } };
  config.optimization.runtimeChunk = false;
  config.optimization.minimize = env === "production";

  // 生产环境压缩时，利用 Terser 插件排除普通注释，但在文件顶部注入油猴特有的 Preamble Banner 信息
  if (config.optimization.minimize) {
    config.optimization.minimizer = [
      new TerserPlugin({
        extractComments: false, // 阻止生成独立许可注释文件 .license.txt
        terserOptions: {
          format: {
            comments: false, // 移除所有其他代码注释
            preamble: banner, // 头部强制置入油猴 Meta 信息
          },
        },
      }),
    ];
  }

  // 生产环境下关闭 source map
  if (env === "production") config.devtool = false;

  config.plugins = config.plugins.filter(
    (plugin) => !names.includes(plugin.constructor.name)
  );

  config.plugins.push(
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["main"],
      template: paths.appHtml,
      filename: "index.html",
    }),
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["options"],
      template: paths.appHtml,
      filename: "options.html",
    })
    // new webpack.BannerPlugin({
    //   banner,
    //   raw: true,
    //   entryOnly: true,
    //   include: "kiss-translator.user",
    // })
  );

  return config;
};

// 方案 C：本地开发网页模式的 Webpack 覆盖配置
const webWebpack = (config, env) => {
  const names = ["HtmlWebpackPlugin"];

  config.entry = {
    main: paths.appIndexJs,
    options: paths.appSrc + "/options.js",
    content: paths.appSrc + "/userscript.js",
  };

  config.output.filename = "[name].js";
  config.output.publicPath = "/";

  config.plugins = config.plugins.filter(
    (plugin) => !names.includes(plugin.constructor.name)
  );

  config.plugins.push(
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["main"],
      template: paths.appHtml,
      filename: "index.html",
    }),
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["options"],
      template: paths.appHtml,
      filename: "options.html",
    }),
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["content"],
      template: paths.appPublic + "/content.html",
      filename: "content.html",
    })
  );

  return config;
};

// 根据环境变量 REACT_APP_CLIENT 的值分配使用上述哪种 Webpack 配置重写方案
let webpackConfig;
switch (process.env.REACT_APP_CLIENT) {
  case "userscript":
    webpackConfig = userscriptWebpack;
    break;
  case "web":
    webpackConfig = webWebpack;
    break;
  default:
    webpackConfig = extWebpack;
}

module.exports = {
  webpack: webpackConfig,
  devServer: (configFunction) => (proxy, allowedHost) => {
    const config = configFunction(proxy, allowedHost);
    const onBeforeSetupMiddleware = config.onBeforeSetupMiddleware;
    const onAfterSetupMiddleware = config.onAfterSetupMiddleware;
    const setupMiddlewares = config.setupMiddlewares;

    if (onBeforeSetupMiddleware || onAfterSetupMiddleware) {
      config.setupMiddlewares = (middlewares, devServer) => {
        if (onBeforeSetupMiddleware) onBeforeSetupMiddleware(devServer);
        const nextMiddlewares = setupMiddlewares
          ? setupMiddlewares(middlewares, devServer)
          : middlewares;
        if (onAfterSetupMiddleware) onAfterSetupMiddleware(devServer);
        return nextMiddlewares;
      };
      delete config.onBeforeSetupMiddleware;
      delete config.onAfterSetupMiddleware;
    }

    return config;
  },
};
