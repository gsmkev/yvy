import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = process.argv[2];
const port = +process.argv[3];
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".ttf": "font/ttf", ".png": "image/png", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
http
  .createServer((q, r) => {
    const u = decodeURIComponent(q.url.split("?")[0]);
    let p = u.startsWith("/maplibre/") ? path.join("/home/user/yvy/.claude/worktrees/agent-a0e8dfbbfa0781cd3/apps/mobile/node_modules/maplibre-gl/dist", path.basename(u)) : path.join(root, u);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, "index.html");
    r.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" });
    fs.createReadStream(p).pipe(r);
  })
  .listen(port);
