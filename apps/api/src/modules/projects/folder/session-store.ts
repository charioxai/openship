/**
 * In-memory registry of folder-upload sessions.
 *
 * Deliberately dependency-free (only node:crypto + a Map): it holds the session
 * RECORD, not the machinery. `folder.service` owns the heavy, mode-specific
 * bits (Oblien provisioning, node:fs staging, tar extraction) and writes here;
 * the deploy pipeline (`build.service`) only READS a record, so it can import
 * this store statically without dragging cloud/self-hosted code into its graph.
 * Mirrors the isolation pattern used for local-source (node:fs stays out of the
 * cloud module graph).
 *
 * RAM-only on purpose — the workspace / staging dir a session points at is
 * itself short-lived, so surviving a restart is meaningless.
 */

import { randomBytes } from "node:crypto";
// Type-only — keeps this module runtime-dependency-free (see the note above).
import type { DeployableService } from "../../../lib/deployable-service";
import type { RequestContext } from "../../../lib/request-context";

export type FolderUploadMode = "oblien-direct" | "api-relay";

export interface FolderSession {
  id: string;
  orgId: string;
  userId: string;
  /** Exact credential/session principal that opened this upload. */
  principalId: string;
  /** Set once, to the exact project created for this upload. */
  projectId?: string;
  mode: FolderUploadMode;
  createdAt: number;
  expiresAt: number;
  /** Cloud (oblien-direct): the provisioned workspace the browser uploads into. */
  workspaceId?: string;
  /** Self-hosted (api-relay): staging dir on this host + single-use upload ticket. */
  stagingDir?: string;
  uploadTicket?: string;
  /** True once bytes have landed (api-relay: after upload; oblien-direct: assumed). */
  uploaded: boolean;
  /** Detected/typed name hint for the project. */
  name?: string;
  /**
   * Compose services the SCAN parsed out of the uploaded source. Written by
   * `scanFolderSession`, read by the deploy step (`requestBuildAccess`) when the
   * caller didn't forward `services` itself — the uploaded compose file is the
   * only description a folder deploy has of its service set, and nothing else
   * survives the scan → ensure → deploy hop.
   */
  services?: DeployableService[];
}

const sessions = new Map<string, FolderSession>();

export function newFolderSessionId(): string {
  return randomBytes(18).toString("base64url");
}

export function putFolderSession(session: FolderSession): void {
  sessions.set(session.id, session);
}

export function getFolderSession(sessionId: string): FolderSession | undefined {
  const s = sessions.get(sessionId);
  if (!s) return undefined;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return undefined;
  }
  return s;
}

export function folderSessionPrincipal(
  ctx: Pick<RequestContext, "sessionId" | "sessionKind" | "tokenScope">,
): string {
  return ctx.tokenScope?.tokenId
    ? `pat:${ctx.tokenScope.tokenId}`
    : `${ctx.sessionKind}:${ctx.sessionId}`;
}

export function getPrincipalFolderSession(
  sessionId: string,
  orgId: string,
  principalId: string,
): FolderSession | undefined {
  const session = getFolderSession(sessionId);
  if (
    !session ||
    session.orgId !== orgId ||
    session.principalId !== principalId
  )
    return undefined;
  return session;
}

/** Atomically bind a principal-owned upload session to one project forever. */
export function claimFolderSessionProject(
  sessionId: string,
  orgId: string,
  principalId: string,
  projectId: string,
): FolderSession | undefined {
  const session = getPrincipalFolderSession(sessionId, orgId, principalId);
  if (!session || (session.projectId && session.projectId !== projectId))
    return undefined;
  session.projectId = projectId;
  return session;
}

/**
 * Drop expired sessions and RETURN the evicted records so the caller can clean
 * up any on-disk staging they own — this module stays free of node:fs so it's
 * safe to import from cloud code paths.
 */
export function sweepExpiredFolderSessions(now: number): FolderSession[] {
  const evicted: FolderSession[] = [];
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) {
      sessions.delete(id);
      evicted.push(s);
    }
  }
  return evicted;
}
