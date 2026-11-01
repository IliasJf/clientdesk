// Static demo for GitHub Pages: the same app and domain code, with the
// workspace API answered in the browser and saved to localStorage.
import React from "react";
import { createRoot } from "react-dom/client";
import Desk from "../../app/Desk";
import {
  DeskError,
  applyCommand,
  createDemo,
  today,
  validateCommand,
} from "../../lib/desk-domain";
import type { Workspace } from "../../lib/desk-types";
import "./demo.css";

const KEY = "clientdesk-demo:workspace";
const user = { id: "demo", name: "Alex Morgan", email: "alex@example.com" };

function read(): Workspace {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as Workspace;
  } catch {}
  return createDemo();
}
function write(workspace: Workspace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(workspace));
  } catch {}
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
    location.href,
  );
  if (!url.pathname.endsWith("/api/workspace")) return realFetch(input, init);
  if ((init?.method || "GET").toUpperCase() === "GET")
    return json({ workspace: read(), user, mode: "local", today: today() });
  try {
    const current = read();
    const command = validateCommand(JSON.parse(String(init?.body)));
    const next = applyCommand(current, command);
    if (next === current) return json({ workspace: current });
    const saved = { ...next, revision: current.revision + 1 };
    write(saved);
    return json({ workspace: saved });
  } catch (error) {
    if (error instanceof DeskError)
      return json({ error: error.message }, error.status);
    return json({ error: "Your change could not be saved." }, 500);
  }
};

// The hosted sign-in and sign-out links have no server here: sign-out resets the demo.
document.addEventListener(
  "click",
  (event) => {
    const link = (event.target as Element).closest?.("a[href]");
    const href = link?.getAttribute("href") || "";
    if (href.startsWith("/signin-with-chatgpt")) event.preventDefault();
    if (href.startsWith("/signout-with-chatgpt")) {
      event.preventDefault();
      if (confirm("Reset the demo to its sample data?")) reset();
    }
  },
  true,
);
function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  location.reload();
}

const badge = document.createElement("div");
badge.className = "demo-badge";
badge.innerHTML =
  '<span>Live demo<span class="demo-badge-more">: changes stay in your browser</span>.</span><button type="button">Reset demo</button><a href="https://github.com/IliasJf/clientdesk" target="_blank" rel="noopener noreferrer">Code</a>';
badge.querySelector("button")!.addEventListener("click", () => {
  if (confirm("Reset the demo to its sample data?")) reset();
});
document.body.insertBefore(badge, document.body.firstChild);

createRoot(document.getElementById("root")!).render(<Desk />);
