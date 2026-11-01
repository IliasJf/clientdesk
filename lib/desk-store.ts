import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { deskWorkspaces } from "../db/schema";
import { DeskError } from "./desk-domain";
import type { Workspace } from "./desk-types";
export async function readWorkspace(
  ownerId: string,
): Promise<Workspace | null> {
  const [row] = await getDb()
    .select()
    .from(deskWorkspaces)
    .where(eq(deskWorkspaces.ownerId, ownerId))
    .limit(1);
  return row ? { ...JSON.parse(row.payload), revision: row.revision } : null;
}
export async function saveWorkspace(
  ownerId: string,
  workspace: Workspace,
  expected: number,
): Promise<Workspace> {
  const next = { ...workspace, revision: expected + 1 };
  const values = {
    payload: JSON.stringify(next),
    revision: next.revision,
    updatedAt: Date.now(),
  };
  const db = getDb();
  const result =
    expected === 0
      ? await db
          .insert(deskWorkspaces)
          .values({ ownerId, ...values })
          .onConflictDoNothing()
          .returning({ id: deskWorkspaces.ownerId })
      : await db
          .update(deskWorkspaces)
          .set(values)
          .where(
            and(
              eq(deskWorkspaces.ownerId, ownerId),
              eq(deskWorkspaces.revision, expected),
            ),
          )
          .returning({ id: deskWorkspaces.ownerId });
  if (!result.length)
    throw new DeskError(
      "Your workspace changed in another tab. Reload before saving.",
      409,
    );
  return next;
}
