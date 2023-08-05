const paths = require("react-scripts/config/paths");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");

const isEnvUserscript = process.env.REACT_APP_CLIENT === "userscript";

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
// @connect       localhost
// ==/UserScript==

`;

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
  const names = [
    "HtmlWebpackPlugin",
    "WebpackManifestPlugin",
    "MiniCssExtractPlugin",
  ];

  config.entry = {
    "kiss-translator-options": paths.appSrc + "/userscriptOptions.js",
    "kiss-translator.user": paths.appSrc + "/userscript.js",
  };

  config.output.filename = "[name].js";
  config.optimization.splitChunks = { cacheGroups: { default: false } };
  config.optimization.runtimeChunk = false;
  config.optimization.minimize = false;

  config.plugins = config.plugins.filter(
    (plugin) => !names.includes(plugin.constructor.name)
  );

  config.plugins.push(
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["kiss-translator-options"],
      template: paths.appHtml,
      filename: "kiss-translator-options.html",
    }),
    new webpack.BannerPlugin({
      banner,
      raw: true,
      entryOnly: true,
      test: "kiss-translator.user.js",
    })
  );

  return config;
};

module.exports = {
  webpack: isEnvUserscript ? userscriptWebpack : extWebpack,
};
