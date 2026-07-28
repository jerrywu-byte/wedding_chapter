import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import worker from "./dist/server/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, "dist", "client");
const port = Number(process.env.PORT || 4173);
const launch = "/brandcolor";
const mime = { ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".png":"image/png", ".webp":"image/webp", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".svg":"image/svg+xml", ".json":"application/json; charset=utf-8", ".woff2":"font/woff2" };

async function assetResponse(request) {
  const url = new URL(request.url);
  const safe = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(assets, safe);
  if (!file.startsWith(assets)) return new Response("Forbidden", { status: 403 });
  try {
    const data = await fs.readFile(file);
    return new Response(data, { headers: { "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "public, max-age=3600" } });
  } catch { return new Response("Not found", { status: 404 }); }
}

const env = {
  ASSETS: { fetch: assetResponse },
  DB: { prepare() { return { bind() { return this; }, first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }; } },
  IMAGES: { input() { throw new Error("Image transform is unavailable locally"); } }
};
const ctx = { waitUntil() {}, passThroughOnException() {} };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const url = `http://127.0.0.1:${port}${req.url}`;
    const init = { method: req.method, headers: req.headers };
    if (!["GET", "HEAD"].includes(req.method || "GET")) init.body = Buffer.concat(chunks);
    const request = new Request(url, init);
    const pathname = new URL(url).pathname;
    let response;
    try {
      const candidate = path.join(assets, pathname);
      const stat = await fs.stat(candidate);
      response = stat.isFile() ? await assetResponse(request) : await worker.fetch(request, env, ctx);
    } catch { response = await worker.fetch(request, env, ctx); }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Wedding Chapter local server error\n${error?.stack || error}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}${launch}`;
  console.log(`Wedding Chapter is ready: ${url}`);
  if (process.platform === "win32") exec(`start "" "${url}"`);
});
