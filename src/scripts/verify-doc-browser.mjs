// Local-only probe of the built DOC worker. No extension APIs or production website changes.
import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = path.resolve("."),
  cache = path.join(root, "tmp/doc-validation"),
  revision = "ff677269004f03007705f3e7f1bc8d0f4546d299";
const files = [
  [
    "PP-DocLayoutV3.onnx",
    5088167,
    "c0721928ff08741bb208ebed539c77170db5234a68cb7e546e6cc9bc172a695b",
  ],
  [
    "PP-DocLayoutV3.onnx.data",
    136774480,
    "34df3e4b79d7bbbf82abce1b4f3cde3d540fa57ad42ec8905c352b97c408d437",
  ],
];
await fs.mkdir(cache, { recursive: true });
async function hash(file) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
for (const [name, size, sha] of files) {
  const local = path.join(cache, name);
  if (
    (await fs.stat(local).then(
      (s) => s.size === size,
      () => false
    )) &&
    (await hash(local)) === sha
  )
    continue;
  console.log(`Downloading pinned ${name}`);
  const res = await fetch(
    `https://huggingface.co/Bei0001/PP-DocLayoutV3-ONNX/resolve/${revision}/${name}`,
    { signal: AbortSignal.timeout(300000) }
  );
  if (!res.ok) throw new Error(`Download ${name}: ${res.status}`);
  await pipeline(
    Readable.fromWeb(res.body),
    (await import("node:fs")).createWriteStream(local)
  );
  if ((await fs.stat(local)).size !== size || (await hash(local)) !== sha)
    throw new Error(`Checksum ${name}`);
  console.log(`Verified ${name}`);
}
const html = String.raw`<!doctype html><meta charset="utf-8"><title>DOC Browser Verification</title><style>body{font:16px system-ui;margin:20px}canvas{max-width:700px}pre{white-space:pre-wrap}</style><h1>DOC 浏览器真实推理验证</h1><p>固定模型 ${revision}，WASM，OPFS，生产 DOC Worker；仅用于本地验收。</p><button id="run">安装并验证两份样本</button> <button id="stop">停止 / 卸载</button><pre id="status">待开始</pre><canvas id="preview"></canvas><pre id="result"></pre><script type="module">
import * as pdfjs from '/pdf.mjs';pdfjs.GlobalWorkerOptions.workerSrc='/assets/pdf/pdf.worker.min.mjs';
const status=document.querySelector('#status'),output=document.querySelector('#result'),canvas=document.querySelector('canvas');let worker,pending=new Map(),sequence=0,stopped=false;
function request(type,extra={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,type,...extra});});}
document.querySelector('#stop').onclick=()=>{stopped=true;worker?.terminate();pending.forEach(p=>p.reject(Error('Cancelled')));pending.clear();status.textContent+='\nStopped; worker disposed';};
document.querySelector('#run').onclick=async()=>{try{stopped=false;document.querySelector('#run').disabled=true;const storage=await navigator.storage.getDirectory();let dir=await storage.getDirectoryHandle('doc',{create:true});dir=await dir.getDirectoryHandle('pp-doclayout-v3',{create:true});
for(const [name,size,sha] of ${JSON.stringify(files)}){status.textContent='安装 '+name;const res=await fetch('/model/'+name);const bytes=await res.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==size||digest!==sha)throw Error('Checksum mismatch');const handle=await dir.getFileHandle(name,{create:true}),writer=await handle.createWritable();await writer.write(bytes);await writer.close();if(stopped)throw Error('Cancelled');}
worker=new Worker('/local-ai/doc-worker.js',{type:'module'});worker.onmessage=({data})=>{if(data.type==='progress'){status.textContent=data.status;return;}const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.type==='error'?p.reject(Error(data.message)):p.resolve(data.result);};worker.onerror=e=>{status.textContent=e.message;pending.forEach(p=>p.reject(Error(e.message)));pending.clear();};
const start=performance.now();await request('load',{spec:{dir:'doc/pp-doclayout-v3',modelFile:'PP-DocLayoutV3.onnx',dataFile:'PP-DocLayoutV3.onnx.data',device:'wasm'}});const loadMs=performance.now()-start;const results=[];
for(const file of ['2601.01674v1.pdf','2601.00597v2.pdf']){status.textContent='推理 '+file;const doc=await pdfjs.getDocument({url:'/samples/'+file,cMapUrl:'/assets/pdf/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/pdf/standard_fonts/',wasmUrl:'/assets/pdf/wasm/',isEvalSupported:false}).promise;const page=await doc.getPage(1),view=page.getViewport({scale:1.3});canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:view}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const result=await request('analyze',{blob});const ctx=canvas.getContext('2d');ctx.strokeStyle='red';ctx.lineWidth=2;result.regions.forEach(r=>{ctx.strokeRect(r.bbox[0],r.bbox[1],r.bbox[2]-r.bbox[0],r.bbox[3]-r.bbox[1]);ctx.fillStyle='red';ctx.fillText(r.order+' '+r.label,r.bbox[0],r.bbox[1]+12);});results.push({file,loadMs,...result});output.textContent=JSON.stringify(results,null,2);await doc.destroy();}
await fetch('/artifacts/doc-browser-results.json',{method:'POST',body:JSON.stringify(results,null,2)});
status.textContent='完成：两份样本，真实 WASM 输出；区域与阅读顺序仍须人工核对。';
const a=document.createElement('a');a.textContent='下载验收 JSON';a.href=URL.createObjectURL(new Blob([JSON.stringify(results,null,2)],{type:'application/json'}));a.download='doc-browser-results.json';document.body.append(a);
}catch(e){status.textContent='失败：'+e.message;}finally{document.querySelector('#run').disabled=false;}};
</script>`;
const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3001").pathname;
  const artifact = path.basename(url);
  if (
    req.method === "POST" &&
    url.startsWith("/artifacts/") &&
    [
      "doc-browser-results.json",
      "2601.01674v1.pdf.png",
      "2601.00597v2.pdf.png",
    ].includes(artifact)
  ) {
    if (req.headers.origin !== "http://127.0.0.1:3001") {
      res.writeHead(403);
      res.end();
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    await fs.writeFile(path.join(cache, artifact), Buffer.concat(chunks));
    res.end("saved");
    return;
  }
  if (url === "/") {
    res.setHeader("Content-Type", "text/html;charset=utf-8");
    res.end(
      html.replace(
        "const result=await request('analyze',{blob});",
        "await fetch('/artifacts/'+file+'.png',{method:'POST',body:blob});const result=await request('analyze',{blob});"
      )
    );
    return;
  }
  let file;
  if (url === "/pdf.mjs") file = path.join(pdfRoot, "build/pdf.mjs");
  else if (url.startsWith("/local-ai/"))
    file = path.join(root, "build/edge-dev", url);
  else if (url.startsWith("/assets/pdf/"))
    file = path.join(root, "build/homepage", url);
  else if (
    url.startsWith("/samples/") &&
    ["2601.01674v1.pdf", "2601.00597v2.pdf"].includes(path.basename(url))
  )
    file = path.join(root, "tmp/pdf", path.basename(url));
  else if (
    url.startsWith("/model/") &&
    files.some((f) => f[0] === path.basename(url))
  )
    file = path.join(cache, path.basename(url));
  if (!file || !path.resolve(file).startsWith(root + path.sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const data = await fs.readFile(file);
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") || file.endsWith(".mjs")
        ? "application/javascript"
        : file.endsWith(".wasm")
          ? "application/wasm"
          : "application/octet-stream"
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(3001, "127.0.0.1", () =>
  console.log("DOC probe: http://127.0.0.1:3001")
);
