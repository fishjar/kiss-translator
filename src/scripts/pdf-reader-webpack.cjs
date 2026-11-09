const fs = require("fs");
const path = require("path");

/**
 * 为 Chrome/Edge 构建增加内置 PDF 阅读器：独立入口、页面模板和 PDF.js 运行时资源。
 * 单独成文件，减少与上游 config-overrides.js 的合并冲突。
 */
module.exports = function configurePdfReader(
  config,
  { paths, minify, HtmlWebpackPlugin }
) {
  if (process.env.REACT_APP_CLIENT !== "chrome") return;

  config.entry["pdf-reader"] = `${paths.appSrc}/pdfReader.js`;
  config.module.rules.push({
    test: /[\\/]pdfjs-dist[\\/]web[\\/]pdf_viewer\.css$/,
    enforce: "pre",
    use: path.resolve(__dirname, "pdf-viewer-css-loader.cjs"),
  });
  config.plugins.push(
    new HtmlWebpackPlugin({
      inject: true,
      chunks: ["pdf-reader"],
      template: `${paths.appPublic}/pdf-reader.html`,
      filename: "pdf-reader.html",
      minify,
    }),
    {
      apply(compiler) {
        compiler.hooks.thisCompilation.tap("PdfReaderAssets", (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: "PdfReaderAssets",
              stage:
                compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
            },
            () => {
              const pdfRoot = path.dirname(
                require.resolve("pdfjs-dist/package.json")
              );
              const emit = (source, target) => {
                if (fs.statSync(source).isDirectory()) {
                  for (const name of fs.readdirSync(source))
                    emit(path.join(source, name), `${target}/${name}`);
                  return;
                }
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
            }
          );
        });
      },
    }
  );
};
