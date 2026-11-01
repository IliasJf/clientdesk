// Builds the static GitHub Pages demo into demo-dist/ for the /clientdesk/ base path.
import { rolldown } from "rolldown";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "demo-dist");
const base = process.env.DEMO_BASE || "/clientdesk/";
const site = `https://iliasjf.github.io${base}`;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const cssFiles = [];
const bundle = await rolldown({
  input: path.join(root, "scripts/demo/entry.tsx"),
  platform: "browser",
  cwd: root,
  transform: {
    jsx: "react-jsx",
    define: { "process.env.NODE_ENV": '"production"' },
  },
  plugins: [
    {
      name: "demo-css",
      load(id) {
        if (id.endsWith(".css")) {
          cssFiles.push(id);
          return { code: "", moduleType: "js" };
        }
      },
    },
  ],
});
await bundle.write({
  dir: out,
  entryFileNames: "app.js",
  chunkFileNames: "chunks/[name]-[hash].js",
  format: "es",
  minify: true,
});
await bundle.close();

// Asset URLs become relative to the page, so the demo works under any base path.
const css = (
  await Promise.all(
    [path.join(root, "app/globals.css"), ...cssFiles].map((f) =>
      readFile(f, "utf8"),
    ),
  )
)
  .join("\n")
  .replaceAll('url("/fonts/', 'url("fonts/');
await writeFile(path.join(out, "app.css"), css);
await cp(path.join(root, "public"), out, { recursive: true });

const title = "ClientDesk — freelancer workspace demo";
const description =
  "Live demo of ClientDesk: clients, projects, invoices with partial payments and PDF export, in USD, EUR and MAD.";
await writeFile(
  path.join(out, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>${title}</title><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${site}og.png"><meta property="og:url" content="${site}"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2f4f7"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111317"><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>`,
);
// Social preview image: the overview screenshot.
await cp(
  path.join(root, "docs/screenshots/overview.png"),
  path.join(out, "og.png"),
);
await writeFile(path.join(out, ".nojekyll"), "");
console.log(`Demo built in demo-dist/ for ${base}`);
