const paths = require("react-scripts/config/paths");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  webpack: (config, env) => {
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
    config.optimization.splitChunks = {
      cacheGroups: { default: false },
    };
    config.optimization.runtimeChunk = false;

    config.plugins = config.plugins.filter(
      (plugin) => !names.find((name) => name.match(plugin.constructor.name))
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
  },
};
