const paths = require("react-scripts/config/paths");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");

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
    popup: paths.appIndexJs,
    options: paths.appSrc + "/options.js",
    background: paths.appSrc + "/background.js",
    content: paths.appSrc + "/content.js",
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
      chunks: ["content"],
      template: paths.appPublic + "/content.html",
      filename: "content.html",
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
// @description   A minimalist bilingual translation extension.
// @author        Gabe<yugang2002@gmail.com>
// @homepageURL   ${process.env.REACT_APP_HOMEPAGE}
// @match         *://*/*
// @icon          https://raw.githubusercontent.com/fishjar/kiss-translator/master/public/images/logo192.png
// @downloadURL   https://raw.githubusercontent.com/fishjar/kiss-translator/master/dist/userscript/kiss-translator.user.js
// @updateURL     https://raw.githubusercontent.com/fishjar/kiss-translator/master/dist/userscript/kiss-translator.user.js
// @grant         GM_xmlhttpRequest
// @grant         GM.xmlhttpRequest
// @grant         GM_setValue
// @grant         GM.setValue
// @grant         GM_getValue
// @grant         GM.getValue
// @grant         GM_deleteValue
// @grant         GM.deleteValue
// @connect       translate.googleapis.com
// @connect       api-edge.cognitive.microsofttranslator.com
// @connect       edge.microsoft.com
// @connect       api.openai.com
// ==/UserScript==

`;

  config.entry = paths.appSrc + "/userscript.js";
  config.output.filename = "kiss-translator.user.js";
  config.optimization.splitChunks = { cacheGroups: { default: false } };
  config.optimization.runtimeChunk = false;
  config.optimization.minimize = false;

  config.plugins.push(
    new webpack.BannerPlugin({
      banner,
      raw: true,
      entryOnly: true,
    })
  );

  return config;
};

// 文档
const webWebpack = (config, env) => {
  const names = ["HtmlWebpackPlugin"];

  config.entry = {
    main: paths.appSrc + "/userscriptIndex.js",
    options: paths.appSrc + "/userscriptOptions.js",
  };

  config.output.filename = "[name].js";

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
