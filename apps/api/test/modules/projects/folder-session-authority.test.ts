import { describe, expect, it } from "vitest";
import {
  claimFolderSessionProject,
  getPrincipalFolderSession,
  newFolderSessionId,
  putFolderSession,
} from "../../../src/modules/projects/folder/session-store";

function seedSession() {
  const id = newFolderSessionId();
  putFolderSession({
    id,
    orgId: "org_1",
    userId: "user_1",
    principalId: "pat:token_1",
    mode: "api-relay",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    uploaded: true,
  });
  return id;
}

describe("folder upload session authority", () => {
  it("binds reads to the exact organization and credential principal", () => {
    const id = seedSession();

    expect(getPrincipalFolderSession(id, "org_1", "pat:token_1")?.id).toBe(id);
    expect(getPrincipalFolderSession(id, "org_1", "pat:token_2")).toBeUndefined();
    expect(getPrincipalFolderSession(id, "org_2", "pat:token_1")).toBeUndefined();
  });

  it("allows an exact project retry but permanently refuses rebinding", () => {
    const id = seedSession();

    expect(claimFolderSessionProject(id, "org_1", "pat:token_1", "proj_1")?.projectId).toBe(
      "proj_1",
    );
    expect(claimFolderSessionProject(id, "org_1", "pat:token_1", "proj_1")?.projectId).toBe(
      "proj_1",
    );
    expect(claimFolderSessionProject(id, "org_1", "pat:token_1", "proj_2")).toBeUndefined();
  });
});
