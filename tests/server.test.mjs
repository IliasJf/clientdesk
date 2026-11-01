import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../scripts/preview-server.mjs";
test("workspace API persists changes and enforces sessions, origins and revisions", async () => {
  const server = await createPreviewServer({ databasePath: ":memory:" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const initial = await (await fetch(origin + "/api/workspace")).json();
    assert.equal(initial.user, null);
    assert.equal(initial.workspace.clients.length, 4);
    const payload = {
      type: "client.create",
      expectedRevision: 0,
      payload: {
        name: "Test contact",
        company: "Test studio",
        email: "test@example.com",
        address: "Test address",
      },
    };
    assert.equal(
      (
        await fetch(origin + "/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      ).status,
      401,
    );
    const login = await fetch(
        origin + "/signin-with-chatgpt?return_to=/analytics",
        { redirect: "manual" },
      ),
      cookie = login.headers.get("set-cookie").split(";")[0];
    const post = (body, originHeader = origin) =>
      fetch(origin + "/api/workspace", {
        method: "POST",
        headers: {
          cookie,
          origin: originHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    assert.equal((await post(payload, "https://foreign.example")).status, 403);
    const response = await post(payload);
    assert.equal(response.status, 200);
    const saved = (await response.json()).workspace;
    assert.equal(saved.revision, 1);
    assert.equal(saved.clients.length, 5);
    assert.equal((await post(payload)).status, 409);
    const read = await (
      await fetch(origin + "/api/workspace", { headers: { cookie } })
    ).json();
    assert.equal(read.workspace.clients.at(-1).company, "Test studio");
    const anonymous = await (
      await fetch(origin + "/api/workspace", {
        headers: { "oai-authenticated-user-id": "local_clientdesk_owner" },
      })
    ).json();
    assert.equal(anonymous.user, null);
    assert.equal(anonymous.workspace.clients.length, 4);
    const maliciousRedirect = await fetch(
      origin + "/signin-with-chatgpt?return_to=https://foreign.example",
      { redirect: "manual" },
    );
    assert.equal(maliciousRedirect.headers.get("location"), "/");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
