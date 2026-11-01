import { buildPreview } from "./build-preview.mjs";
import { createPreviewServer } from "./preview-server.mjs";
await buildPreview();
const server = await createPreviewServer();
server.listen(Number(process.env.PORT) || 5174, "127.0.0.1", () =>
  console.log(
    `ClientDesk local preview: http://127.0.0.1:${server.address().port}\nDevelopment sign-in is local-only; production uses Sites authentication.`,
  ),
);

