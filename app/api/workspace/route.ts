import { getChatGPTUser } from "../../chatgpt-auth";
import {
  assertSameOrigin,
  readBoundedJson,
  jsonResponse,
  routeError,
} from "../../../lib/api-security";
import {
  DeskError,
  createDemo,
  today,
  validateCommand,
  applyCommand,
} from "../../../lib/desk-domain";
import { readWorkspace, saveWorkspace } from "../../../lib/desk-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getChatGPTUser();
    const workspace = user
      ? ((await readWorkspace(user.userId)) ?? createDemo())
      : createDemo();
    return jsonResponse({
      workspace,
      user: user
        ? { id: user.userId, name: user.displayName, email: user.email }
        : null,
      mode: "hosted",
      today: today(),
    });
  } catch (e) {
    return routeError(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new DeskError("Sign in to save your workspace.", 401);
    assertSameOrigin(request);
    const command = validateCommand(await readBoundedJson(request, 150000));
    const current = (await readWorkspace(user.userId)) ?? createDemo();
    const next = applyCommand(current, command);
    const workspace =
      next === current
        ? current
        : await saveWorkspace(user.userId, next, current.revision);
    return jsonResponse({ workspace });
  } catch (e) {
    if (e instanceof DeskError)
      return jsonResponse({ error: e.message }, e.status);
    return routeError(e);
  }
}
