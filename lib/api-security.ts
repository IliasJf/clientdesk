export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface RequestIdentity {
  userId: string;
}

/** Only the server-authenticated identity selects the writable database row. */
export function requireOwnerId(user: RequestIdentity | null): string {
  if (!user?.userId)
    throw new ApiError("Sign in to manage your workspace.", 401);
  return user.userId;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const destination = new URL(request.url).origin;
  if (!origin || origin !== destination)
    throw new ApiError("This request must come from the same website.", 403);
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = 250_000,
): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError("Send the change as JSON.", 415);
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes)
    throw new ApiError("This change is too large to save.", 413);
  if (!request.body) throw new ApiError("Nothing was sent to save.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new ApiError("This change is too large to save.", 413);
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, position);
    position += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new ApiError("This change could not be read. Reload and try again.", 400);
  }
}

export function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function routeError(error: unknown): Response {
  if (error instanceof ApiError)
    return jsonResponse({ error: error.message }, error.status);
  // Infrastructure details must stay server-side.
  console.error(
    "Workspace API failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return jsonResponse(
    { error: "We couldn't load or save your workspace. Try again in a moment." },
    503,
  );
}
