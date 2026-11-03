const path = require("node:path");

const WORKER_LAYER = "html-text-worker";

module.exports = function configureHtmlDecoder(config, webpack) {
  config.experiments = { ...config.experiments, layers: true };
  config.entry.background = {
    import: config.entry.background,
    layer: WORKER_LAYER,
  };
  config.plugins.push(
    new webpack.NormalModuleReplacementPlugin(
      /(^|[/\\])htmlTextDecoder(?:\.js)?$/,
      (resource) => {
        if (resource.contextInfo.issuerLayer === WORKER_LAYER) {
          resource.request = path.resolve(
            __dirname,
            "../libs/htmlTextDecoder.worker.js"
          );
        }
      }
    )
  );
};
