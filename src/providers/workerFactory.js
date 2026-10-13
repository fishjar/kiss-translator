// Webpack recognizes this statically and emits a separate, on-demand worker bundle.
export const createProviderWorker = () =>
  new Worker(new URL("./scriptWorker.js", import.meta.url));
