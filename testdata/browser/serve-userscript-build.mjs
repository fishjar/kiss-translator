import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const directory = resolve(
  process.env.USERSCRIPT_BUILD_PATH || "testdata/browser/production-userscript"
);
const ports = (process.env.USERSCRIPT_FIXTURE_PORTS || "3157,3158")
  .split(",")
  .map(Number);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
for (const port of ports) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const legacy = url.pathname === "/__fixture__/legacy-userscript";
      const path = legacy
        ? "options.html"
        : decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const file = resolve(directory, path);
      if (!file.startsWith(`${directory}${sep}`)) {
        res.writeHead(403);
        return res.end();
      }
      let content = await readFile(file);
      if (legacy) {
        const bridge = `<base href="/"><script>
window.APP_INFO = { name: "KISS Translator", version: "2.0.31", eventName: "fixture-legacy-gm" };
window.fixtureGmCalls = [];
window.addEventListener("fixture-legacy-gm", ({ detail }) => {
  window.fixtureGmCalls.push(detail);
  const { action, args = {} } = detail;
  let data;
  let error;
  try {
    if (action === "getValue") data = localStorage.getItem(args.key) ?? undefined;
    else if (action === "setValue") localStorage.setItem(args.key, args.val);
    else if (action === "deleteValue") localStorage.removeItem(args.key);
    else if (action === "info") data = { script: { name: "KISS Translator", version: "2.0.31" }, scriptHandler: "Browser verification fixture" };
    else throw new Error("Unexpected fixture GM action: " + action);
  } catch (cause) { error = cause.message; }
  window.dispatchEvent(new CustomEvent(detail.pong, { detail: { data, error } }));
});
</script>`;
        content = Buffer.from(
          content.toString("utf8").replace("<head>", `<head>${bridge}`)
        );
      }
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      res.end(content);
    } catch (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.message);
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Production userscript fixture: http://127.0.0.1:${port}/options.html`
    )
  );
}
