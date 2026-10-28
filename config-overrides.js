const paths = require("react-scripts/config/paths");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
const fs = require("fs");
const configureHtmlDecoder = require("./src/scripts/html-decoder-webpack.cjs");
let webpack;
try {
  webpack = require("webpack");
} catch {
  const req = require("module").createRequire(
    require.resolve("react-scripts/package.json")
  );
  webpack = req("webpack");
}

const aliasLocalRuntime = (config) => {
  config.resolve.alias = {
    ...config.resolve.alias,
    [path.resolve(__dirname, "src/localAi/runtime/runtimeManager")]:
      path.resolve(__dirname, "src/localAi/runtime/runtimeManager.webpack.js"),
    [path.resolve(__dirname, "src/localAi/runtime/runtimeManager.ts")]:
      path.resolve(__dirname, "src/localAi/runtime/runtimeManager.webpack.js"),
  };
};

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
    ...(process.env.REACT_APP_CLIENT === "firefox"
      ? { "subtitle-bootstrap": paths.appSrc + "/subtitleBootstrap.js" }
      : {}),
    "injector-shadowroot": paths.appSrc + "/injector-shadowroot.js", // ShadowRoot 拦截注入脚本
    "file-bridge": paths.appSrc + "/fileBridge.js",
  };

  configureHtmlDecoder(config, webpack);

  // 2. 将输出的文件命名重写为固定格式，方便 manifest.json 静态引用，防止文件哈希化导致引用失效
  config.output.filename = "[name].js";
  config.output.assetModuleFilename = "media/[name][ext]";
  // 动态依赖随入口打包；保留分块注册机制，让 HTML 加载的页面共享模块正常启动。
  config.module.parser = {
    ...config.module.parser,
    javascript: {
      ...config.module.parser?.javascript,
      dynamicImportMode: "eager",
    },
  };
  aliasLocalRuntime(config);

  config.optimization.splitChunks = {
    cacheGroups: {
      default: false,
      defaultVendors: false,
      pageShared: {
        chunks: (chunk) => ["popup", "options"].includes(chunk.name),
        minChunks: 2,
        minSize: 20000,
        name: (_module, chunks) =>
          `page-shared-${chunks
            .map((chunk) => chunk.name)
            .sort()
            .join("-")}`,
        enforce: true,
      },
    },
  };
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

  config.ignoreWarnings = [
    ...(config.ignoreWarnings || []),
    /Critical dependency: 'import\.meta' cannot be used as a standalone expression/,
  ];

  config.plugins.push({
    apply(compiler) {
      compiler.hooks.done.tap("BundleModuleReport", (stats) => {
        const destination = path.resolve(__dirname, "tmp/build-analysis");
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(
          path.join(
            destination,
            `${process.env.REACT_APP_CLIENT}-webpack.json`
          ),
          JSON.stringify(
            stats.toJson({
              all: false,
              assets: true,
              chunks: true,
              chunkModules: true,
              modules: true,
              nestedModules: true,
              dependentModules: true,
              groupModulesByAttributes: false,
              groupModulesByCacheStatus: false,
              groupModulesByType: false,
              groupModulesByPath: false,
              modulesSpace: Infinity,
              chunkModulesSpace: Infinity,
              nestedModulesSpace: Infinity,
            })
          )
        );
      });
    },
  });

  // 生产环境优化：Terser 压缩优化，启用双轮死代码消除与调试代码剥离
  if (isEnvProduction && Array.isArray(config.optimization.minimizer)) {
    config.optimization.minimizer = config.optimization.minimizer.map(
      (plugin) => {
        if (plugin.constructor.name === "TerserPlugin") {
          return new TerserPlugin({
            terserOptions: {
              ...plugin.options?.terserOptions,
              compress: {
                ...(plugin.options?.terserOptions?.compress || {}),
                passes: 2,
                pure_funcs: ["console.debug"],
              },
              format: {
                ...(plugin.options?.terserOptions?.format || {}),
                comments: false,
              },
            },
            extractComments: false,
          });
        }
        return plugin;
      }
    );
  }

  return config;
};

// 方案 B：油猴脚本 (Userscript) 编译覆盖配置
const userscriptWebpack = (config, env) => {
  aliasLocalRuntime(config);
  config.resolve.alias = {
    ...config.resolve.alias,
    webdav$: path.resolve(__dirname, "src/libs/stubs/webdav-stub.js"),
    [path.resolve(__dirname, "src/libs/interpreter.js")]: path.resolve(
      __dirname,
      "src/libs/stubs/interpreter-gm.js"
    ),
    "webextension-polyfill$": path.resolve(
      __dirname,
      "src/libs/stubs/empty-object.js"
    ),
  };
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
// @grant         GM.addValueChangeListener
// @grant         GM_addValueChangeListener
// @grant         GM.removeValueChangeListener
// @grant         GM_removeValueChangeListener
// @grant         GM.info
// @grant         GM_info
// @grant         unsafeWindow
// @connect       translate.googleapis.com
// @connect       translate-pa.googleapis.com
// @connect       translation.googleapis.com
// @connect       generativelanguage.googleapis.com
// @connect       api.cognitive.microsofttranslator.com
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
// @connect       api.apimart.ai
// @connect       apimart.ai
// @connect       go.apimart.ai
// @connect       api.apib.ai
// @connect       apib.ai
// @connect       translate.volcengine.com
// @connect       translate.api.cloud.yandex.net
// @connect       translate.yandex.net
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
// @connect       api.orcarouter.ai
// @connect       router.requesty.ai
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

  // 生产环境压缩时，利用 Terser 插件排除普通注释，强化双轮死代码消除与调试剥离，文件顶部注入油猴 Meta Banner
  if (config.optimization.minimize) {
    config.optimization.minimizer = [
      new TerserPlugin({
        extractComments: false, // 阻止生成独立许可注释文件 .license.txt
        terserOptions: {
          compress: {
            passes: 2,
            pure_funcs: ["console.debug"],
          },
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
    // 强制限制分包数量为 1，确保油猴脚本和页面脚本自包含，避免产生外部 chunk 导致 404 异常
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
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
    {
      apply(compiler) {
        compiler.hooks.done.tap("BundleModuleReport", (stats) => {
          const destination = path.resolve(__dirname, "tmp/build-analysis");
          fs.mkdirSync(destination, { recursive: true });
          fs.writeFileSync(
            path.join(
              destination,
              `${process.env.REACT_APP_CLIENT}-webpack.json`
            ),
            JSON.stringify(
              stats.toJson({
                all: false,
                assets: true,
                chunks: true,
                chunkModules: true,
                modules: true,
                nestedModules: true,
                dependentModules: true,
                groupModulesByAttributes: false,
                groupModulesByCacheStatus: false,
                groupModulesByType: false,
                groupModulesByPath: false,
                modulesSpace: Infinity,
                chunkModulesSpace: Infinity,
                nestedModulesSpace: Infinity,
              })
            )
          );
        });
      },
    }
  );

  return config;
};

// 方案 C：本地开发网页模式的 Webpack 覆盖配置
const webWebpack = (config, env) => {
  config.module.rules.push({
    test: /[\\/]pdfjs-dist[\\/]web[\\/]pdf_viewer\.css$/,
    enforce: "pre",
    use: path.resolve(__dirname, "src/scripts/pdf-viewer-css-loader.cjs"),
  });
  config.plugins.push({
    apply(compiler) {
      compiler.hooks.thisCompilation.tap("PdfAssets", (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: "PdfAssets",
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
          },
          () => {
            const pdfRoot = path.dirname(
              require.resolve("pdfjs-dist/package.json")
            );
            const katexRoot = path.join(
              path.dirname(require.resolve("katex/package.json")),
              "dist"
            );
            const emit = (source, target) => {
              if (fs.statSync(source).isDirectory()) {
                for (const name of fs.readdirSync(source))
                  emit(path.join(source, name), `${target}/${name}`);
              } else
                compilation.emitAsset(
                  target,
                  new compiler.webpack.sources.RawSource(
                    fs.readFileSync(source)
                  )
                );
            };
            emit(
              path.join(pdfRoot, "build/pdf.worker.min.mjs"),
              "assets/pdf/pdf.worker.min.mjs"
            );
            for (const dir of ["cmaps", "standard_fonts", "wasm"])
              emit(path.join(pdfRoot, dir), `assets/pdf/${dir}`);
            emit(
              path.join(katexRoot, "katex.min.css"),
              "assets/pdf/katex.min.css"
            );
            emit(path.join(katexRoot, "fonts"), "assets/pdf/fonts");
          }
        );
      });
    },
  });
  const homepageOnly = process.env.REACT_APP_WEB_APP === "homepage";
  if (!homepageOnly) aliasLocalRuntime(config);
  const names = ["HtmlWebpackPlugin"];

  config.entry = {
    main: paths.appIndexJs,
    ...(!homepageOnly
      ? {
          options: paths.appSrc + "/options.js",
          content: paths.appSrc + "/userscript.js",
        }
      : {}),
    fileTranslate: paths.appSrc + "/fileTranslate.js",
  };

  config.output.filename =
    homepageOnly && env === "production"
      ? "assets/homepage/[name].[contenthash:8].js"
      : "[name].js";
  config.output.chunkFilename =
    homepageOnly && env === "production"
      ? "assets/homepage/[name].[contenthash:8].chunk.js"
      : config.output.chunkFilename;
  config.output.assetModuleFilename = homepageOnly
    ? "assets/homepage/[name].[hash:8][ext]"
    : config.output.assetModuleFilename;
  config.output.publicPath = env === "production" ? "./" : "/";

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
    ...(!homepageOnly
      ? [
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
          }),
        ]
      : []),
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["fileTranslate"],
      template: paths.appPublic + "/file-translate.html",
      filename: "file-translate.html",
    })
  );

  if (homepageOnly) {
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.compilation.tap("FileWebBoundary", (compilation) => {
          compilation.hooks.finishModules.tap("FileWebBoundary", (modules) => {
            const resources = [...modules]
              .map((module) => module.resource)
              .filter(Boolean)
              .map((resource) =>
                path.relative(__dirname, resource).replace(/\\/g, "/")
              );
            const forbidden = resources.filter(
              (resource) =>
                /^(src\/(apis|localAi)\/|src\/libs\/(storage|browser|msg|request|fetch|cache|pool|fileTranslationService)\.[jt]s$)/.test(
                  resource
                ) || resource.includes("/webextension-polyfill/")
            );
            if (forbidden.length)
              compilation.errors.push(
                new Error(
                  `文件翻译 Web 产物包含扩展服务依赖: ${forbidden.join(", ")}`
                )
              );
            const reportDir = path.resolve(__dirname, "tmp/build-analysis");
            fs.mkdirSync(reportDir, { recursive: true });
            fs.writeFileSync(
              path.join(reportDir, "homepage-modules.json"),
              JSON.stringify(
                resources
                  .filter((resource) => resource.startsWith("src/"))
                  .sort(),
                null,
                2
              )
            );
          });
        });
      },
    });
    for (const plugin of config.plugins) {
      if (plugin.constructor.name === "MiniCssExtractPlugin") {
        plugin.options.filename = "assets/homepage/[name].[contenthash:8].css";
        plugin.options.chunkFilename =
          "assets/homepage/[name].[contenthash:8].chunk.css";
      }
    }
  }
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
  jest: (config) => {
    if (!process.env.REACT_APP_CLIENT) process.env.REACT_APP_CLIENT = "chrome";
    config.testPathIgnorePatterns = [
      ...(config.testPathIgnorePatterns || []),
      "<rootDir>/src/localAi/",
    ];
    // googlevideo ships ESM only; exercise the pinned parser/protos in Jest 27.
    const googlevideoRoot = path.dirname(
      fs.realpathSync(
        path.join(__dirname, "node_modules/googlevideo/package.json")
      )
    );
    const googlevideoRequire = require("module").createRequire(
      path.join(googlevideoRoot, "package.json")
    );
    config.moduleNameMapper = {
      ...config.moduleNameMapper,
      "^mp4box$": require.resolve("mp4box").replace(/\.js$/, ".cjs"),
      "^googlevideo/(ump|protos)$": path.join(
        googlevideoRoot,
        "dist/src/exports/$1.js"
      ),
      "^@bufbuild/protobuf/wire$": googlevideoRequire.resolve(
        "@bufbuild/protobuf/wire"
      ),
    };
    config.transformIgnorePatterns = [
      "[/\\\\]node_modules[/\\\\](?!(?:\\.pnpm[/\\\\])?(?:googlevideo(?:@|[/\\\\])|@bufbuild(?:\\+|[/\\\\])protobuf(?:@|[/\\\\])))",
      ...(config.transformIgnorePatterns || []).filter(
        (pattern) => !pattern.includes("node_modules")
      ),
    ];
    return config;
  },
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
