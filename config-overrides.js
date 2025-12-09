const paths = require("react-scripts/config/paths");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserPlugin = require("terser-webpack-plugin");
// const webpack = require("webpack");

console.log("process.env.REACT_APP_CLIENT", process.env.REACT_APP_CLIENT);

// 扩展
const extWebpack = (config, env) => {
  const isEnvProduction = env === "production";
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
  const names = [
    "HtmlWebpackPlugin",
    "WebpackManifestPlugin",
    "MiniCssExtractPlugin",
  ];

  config.entry = {
    popup: paths.appSrc + "/popup.js",
    options: paths.appSrc + "/options.js",
    background: paths.appSrc + "/background.js",
    content: paths.appSrc + "/content.js",
    "injector-subtitle": paths.appSrc + "/injector-subtitle.js",
    "injector-shadowroot": paths.appSrc + "/injector-shadowroot.js",
  };

  config.output.filename = "[name].js";
  config.output.assetModuleFilename = "media/[name][ext]";
  config.optimization.splitChunks = { cacheGroups: { default: false } };
  config.optimization.runtimeChunk = false;

  config.plugins = config.plugins.filter(
    (plugin) => !names.includes(plugin.constructor.name)
  );

  config.plugins.push(
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["options"],
      template: paths.appHtml,
      filename: "options.html",
      minify,
    }),
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

// 油猴
const userscriptWebpack = (config, env) => {
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
// @connect       githubusercontent.com
// @connect       kiss-translator.rayjar.com
// @connect       ghproxy.com
// @connect       dav.jianguoyun.com
// @connect       fanyi.baidu.com
// @connect       transmart.qq.com
// @connect       niutrans.com
// @connect       translate.volcengine.com
// @connect       dict.youdao.com
// @connect       api.anthropic.com
// @connect       api.siliconflow.cn
// @connect       api.cloudflare.com
// @connect       openrouter.ai
// @connect       localhost
// @connect       127.0.0.1
// @run-at        document-end
// ==/UserScript==

`;

  const names = ["HtmlWebpackPlugin"];

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

  if (config.optimization.minimize) {
    config.optimization.minimizer = [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          format: {
            comments: false,
            preamble: banner,
          },
        },
      }),
    ];
  }

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

// 开发
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
};
