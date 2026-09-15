import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Run the actual production cipher when creating and inspecting test packets.
const cryptoSource = await readFile(
  new URL("../../src/libs/syncCrypto.js", import.meta.url),
  "utf8"
);
const { encryptSyncValue, decryptSyncValue } = await import(
  `data:text/javascript;base64,${Buffer.from(cryptoSource).toString("base64")}`
);
const port = Number(process.env.FIXTURE_PORT || 3134);
const appPort = Number(process.env.APP_PORT || 3133);
const passphrase = "browser-review-secret";
const remotes = new Map();
const plans = [];
const gates = new Map();
const requests = [];
let sequence = 0;

const targetState = (target) => {
  if (!remotes.has(target)) remotes.set(target, new Map());
  return remotes.get(target);
};
const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};
const json = (res, status, value) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value, null, 2));
};
const decode = async (packet) => {
  if (!packet) return undefined;
  try {
    const result = await decryptSyncValue(packet.value, passphrase);
    return {
      ...packet,
      encrypted: result.encrypted,
      decoded: JSON.parse(result.value),
    };
  } catch (error) {
    return { ...packet, decodeError: error.message };
  }
};
const inspect = async () => ({
  remotes: Object.fromEntries(
    await Promise.all(
      [...remotes].map(async ([target, files]) => [
        target,
        Object.fromEntries(
          await Promise.all(
            [...files].map(async ([key, packet]) => [key, await decode(packet)])
          )
        ),
      ])
    )
  ),
  requests: await Promise.all(
    requests.map(async (entry) => ({
      ...entry,
      packet: await decode(entry.packet),
      response: await decode(entry.response),
    }))
  ),
  plans,
  gates: [...gates.keys()],
});
const applyPlan = async (entry) => {
  const index = plans.findIndex(
    (plan) =>
      (!plan.target || plan.target === entry.target) &&
      (!plan.key || plan.key === entry.key) &&
      (!plan.method || plan.method === entry.method)
  );
  if (index < 0) return {};
  const [plan] = plans.splice(index, 1);
  entry.plan = plan;
  if (plan.hold) {
    entry.held = true;
    await new Promise((resolve) => gates.set(plan.hold, resolve));
    gates.delete(plan.hold);
    entry.held = false;
  }
  if (plan.delayMs)
    await new Promise((resolve) => setTimeout(resolve, plan.delayMs));
  return plan;
};
const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,HEAD,PROPFIND,MKCOL,OPTIONS"
  );
  res.setHeader("Access-Control-Expose-Headers", "*");
  if (req.method === "OPTIONS") return res.end();
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === "/__fixture__/state")
      return json(res, 200, await inspect());
    if (url.pathname === "/__fixture__/control" && req.method === "POST") {
      const control = JSON.parse(await readBody(req));
      if (control.reset) {
        for (const release of gates.values()) release();
        gates.clear();
        remotes.clear();
        requests.length = 0;
        plans.length = 0;
        sequence = 0;
      }
      for (const seed of control.seed || []) {
        const packet = seed.packet || {
          key: seed.key,
          updateAt: seed.updateAt || 0,
          value: seed.legacy
            ? JSON.stringify(seed.value)
            : await encryptSyncValue(
                JSON.stringify(seed.value),
                seed.passphrase || passphrase
              ),
        };
        targetState(seed.target || "a").set(seed.key, packet);
      }
      plans.push(...(control.plans || []));
      for (const name of control.release || []) gates.get(name)?.();
      return json(res, 200, await inspect());
    }
    if (
      url.pathname === "/__fixture__/start" ||
      url.pathname === "/__fixture__/inspect"
    ) {
      const template = await readFile(
        new URL("./sync-fixture.html", import.meta.url),
        "utf8"
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(template);
    }
    const match = url.pathname.match(
      /^\/([ab])\/(sync|kiss-translator(?:\/(.*))?)$/
    );
    if (match) {
      const [, target, operation, rawKey] = match;
      const key = rawKey ? decodeURIComponent(rawKey) : undefined;
      const files = targetState(target);
      const isWorker = operation === "sync";
      const packet =
        isWorker || req.method === "PUT"
          ? JSON.parse(await readBody(req))
          : undefined;
      const entry = {
        id: ++sequence,
        target,
        key: key || packet?.key,
        method: req.method,
        receivedAt: Date.now(),
        packet,
      };
      requests.push(entry);
      // Capture the response before delaying it, as an already-started network request does.
      const previous = files.get(entry.key);
      const response = isWorker
        ? previous && previous.updateAt >= packet.updateAt
          ? previous
          : packet
        : previous;
      const plan = await applyPlan(entry);
      if (plan.status) {
        entry.status = plan.status;
        entry.completedAt = Date.now();
        return json(res, plan.status, { error: "Injected fixture failure" });
      }
      if (isWorker) {
        if (response === packet) files.set(entry.key, packet);
        entry.response = response;
        entry.uploaded = response === packet;
        entry.status = 200;
        entry.completedAt = Date.now();
        return json(res, 200, response);
      }
      if (req.method === "PUT") {
        files.set(key, packet);
        entry.uploaded = true;
        entry.status = 201;
        entry.completedAt = Date.now();
        res.writeHead(201);
        return res.end();
      }
      if (req.method === "MKCOL") {
        entry.status = 201;
        entry.completedAt = Date.now();
        res.writeHead(201);
        return res.end();
      }
      if (key && !previous) {
        entry.status = 404;
        entry.completedAt = Date.now();
        res.writeHead(404);
        return res.end();
      }
      if (req.method === "PROPFIND") {
        entry.status = 207;
        entry.completedAt = Date.now();
        res.writeHead(207, { "Content-Type": "application/xml" });
        return res.end(
          `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${escapeXml(url.pathname)}</d:href><d:propstat><d:prop><d:resourcetype>${key ? "" : "<d:collection/>"}</d:resourcetype><d:getcontentlength>${previous ? JSON.stringify(previous).length : 0}</d:getcontentlength><d:getlastmodified>Tue, 15 Sep 2026 00:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`
        );
      }
      entry.status = 200;
      entry.response = previous;
      entry.completedAt = Date.now();
      if (req.method === "HEAD") return res.end();
      return json(res, 200, previous);
    }
    // Proxy the unmodified development app under the fixture origin, so its
    // browser localStorage and real requests can be inspected in one place.
    const proxy = http.request(
      {
        hostname: "127.0.0.1",
        port: appPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${appPort}` },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      }
    );
    proxy.on("error", (error) => json(res, 502, { error: error.message }));
    req.pipe(proxy);
  } catch (error) {
    json(res, 500, { error: error.stack });
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Fixture server: http://127.0.0.1:${port}/__fixture__/start`);
  console.log(`App proxy: http://127.0.0.1:${port}/options.html#/sync`);
  console.log(`Source: ${fileURLToPath(import.meta.url)}`);
});
