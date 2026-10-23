import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "..", "dist");
const port = Number(process.env.DRIVER_WEB_PORT ?? 8082);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (pathname.startsWith("/app")) pathname = pathname.slice(4) || "/";
  const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = join(root, safe);
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(root, "index.html");
}

createServer((req, res) => {
  const file = resolveFile(req.url ?? "/");
  const type = types[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Driver web (produção) em http://127.0.0.1:${port}/app`);
});
