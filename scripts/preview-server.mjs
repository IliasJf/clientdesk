// Development adapter: loopback only, with a local demo session. Never publish this server.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DeskError,
  applyCommand,
  createDemo,
  today,
  validateCommand,
} from "../lib/desk-domain.ts";
import {
  ApiError,
  assertSameOrigin,
  readBoundedJson,
} from "../lib/api-security.ts";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};
export async function createPreviewServer({
  databasePath = path.join(root, ".sites-runtime/clientdesk.sqlite"),
} = {}) {
  if (databasePath !== ":memory:")
    await mkdir(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  const migrationFiles = (await readdir(path.join(root, "drizzle")))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const version = db.prepare("PRAGMA user_version").get().user_version;
  for (let index = version; index < migrationFiles.length; index++) {
    db.exec("BEGIN");
    try {
      db.exec(
        await readFile(
          path.join(root, "drizzle", migrationFiles[index]),
          "utf8",
        ),
      );
      db.exec(`PRAGMA user_version=${index + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  const token = randomBytes(32).toString("hex"),
    owner = {
      id: "local_clientdesk_owner",
      name: "Alex Morgan",
      email: "alex@example.com",
    };
  function json(res, value, status = 200) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  }
  function read() {
    const row = db
      .prepare("SELECT payload,revision FROM desk_workspaces WHERE owner_id=?")
      .get(owner.id);
    return row
      ? { ...JSON.parse(row.payload), revision: row.revision }
      : createDemo();
  }
  function save(workspace, expected) {
    const next = { ...workspace, revision: expected + 1 },
      payload = JSON.stringify(next);
    const result =
      expected === 0
        ? db
            .prepare(
              "INSERT INTO desk_workspaces(owner_id,payload,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO NOTHING",
            )
            .run(owner.id, payload, next.revision, Date.now())
        : db
            .prepare(
              "UPDATE desk_workspaces SET payload=?,revision=?,updated_at=? WHERE owner_id=? AND revision=?",
            )
            .run(payload, next.revision, Date.now(), owner.id, expected);
    if (!result.changes)
      throw new DeskError(
        "Your workspace changed in another tab. Reload before saving.",
        409,
      );
    return next;
  }
  const server = createServer(async (req, res) => {
    try {
      const port = server.address().port;
      if (
        ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)
      ) {
        res.writeHead(403);
        res.end("Loopback preview only.");
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host}`),
        signed = (req.headers.cookie || "")
          .split(";")
          .some((v) => v.trim() === `clientdesk_local=${token}`);
      if (url.pathname === "/signin-with-chatgpt") {
        const target = url.searchParams.get("return_to") || "/";
        let safe = "/";
        try {
          const next = new URL(target, url.origin);
          if (
            next.origin === url.origin &&
            target.startsWith("/") &&
            !target.startsWith("//")
          )
            safe = next.pathname + next.search + next.hash;
        } catch {}
        res.writeHead(302, {
          "Set-Cookie": `clientdesk_local=${token}; HttpOnly; SameSite=Strict; Path=/`,
          Location: safe,
        });
        res.end();
        return;
      }
      if (url.pathname === "/signout-with-chatgpt") {
        res.writeHead(302, {
          "Set-Cookie":
            "clientdesk_local=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/",
          Location: "/",
        });
        res.end();
        return;
      }
      if (url.pathname === "/api/workspace") {
        if (req.method === "GET") {
          json(res, {
            workspace: signed ? read() : createDemo(),
            user: signed ? owner : null,
            mode: "local",
            today: today(),
          });
          return;
        }
        if (req.method !== "POST")
          throw new DeskError("Method not allowed.", 405);
        if (!signed)
          throw new DeskError("Open a workspace before saving.", 401);
        const request = new Request(url, {
          method: "POST",
          headers: req.headers,
          body: Readable.toWeb(req),
          duplex: "half",
        });
        assertSameOrigin(request);
        const command = validateCommand(await readBoundedJson(request, 150000)),
          current = read(),
          next = applyCommand(current, command);
        json(res, {
          workspace: next === current ? current : save(next, current.revision),
        });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        json(res, { error: "Not found." }, 404);
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      let target;
      if (url.pathname === "/")
        target = path.join(root, ".sites-runtime/preview/index.html");
      else if ((["/app.js", "/app.css"].includes(url.pathname) || /^\/chunks\/[A-Za-z0-9_.-]+\.js$/.test(url.pathname)))
        target = path.join(
          root,
          ".sites-runtime/preview",
          url.pathname.slice(1),
        );
      else {
        const publicRoot = path.join(root, "public");
        target = path.resolve(
          publicRoot,
          `.${decodeURIComponent(url.pathname)}`,
        );
        if (!target.startsWith(publicRoot + path.sep) || !existsSync(target)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
      }
      const bytes = await readFile(target);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (e) {
      const known = e instanceof ApiError || e instanceof DeskError;
      json(
        res,
        {
          error: known
            ? e.message
            : "The workspace could not complete this request.",
        },
        known ? e.status : 500,
      );
    }
  });
  server.on("close", () => db.close());
  return server;
}

