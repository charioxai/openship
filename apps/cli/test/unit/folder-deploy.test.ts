import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRaw, apiRequest, execFileSync, existsSync, readFileSync, rmSync } = vi.hoisted(() => ({
  apiRaw: vi.fn(),
  apiRequest: vi.fn(),
  execFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => Buffer.from("archive")),
  rmSync: vi.fn(),
}));

vi.mock("../../src/lib/api-client", () => ({ apiRaw, apiRequest }));
vi.mock("node:child_process", () => ({ execFileSync }));
vi.mock("node:fs", () => ({ existsSync, readFileSync, rmSync }));

import { deployFolder } from "../../src/lib/folder-deploy";

describe("folder deploy authority flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRaw.mockResolvedValue(new Response(null, { status: 204 }));
    apiRequest.mockImplementation(async (path: string) => {
      if (path === "/projects/folder/session") {
        return { sessionId: "upload_1", upload: { url: "/projects/folder/upload/upload_1" } };
      }
      if (path === "/projects/folder/scan/upload_1") {
        return {
          success: true,
          name: "demo",
          stack: "node",
          startCommand: "npm start",
          port: 3000,
        };
      }
      if (path === "/projects") return { data: { id: "proj_1" } };
      if (path === "/projects/proj_1/stage-folder") {
        return { success: true, project_id: "proj_1" };
      }
      if (path === "/deployments/build/access") {
        return { success: true, deployment_id: "dep_1", project_id: "proj_1" };
      }
      throw new Error(`Unexpected API path: ${path}`);
    });
  });

  it("creates, binds, and stages the exact project before build", async () => {
    await expect(deployFolder({ cwd: "/workspace/demo" })).resolves.toEqual({
      deploymentId: "dep_1",
      projectId: "proj_1",
    });

    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/projects/folder/session",
      "/projects/folder/scan/upload_1",
      "/projects",
      "/projects/proj_1/stage-folder",
      "/deployments/build/access",
    ]);
    expect(apiRequest.mock.calls.some(([path]) => path === "/projects/ensure")).toBe(false);
    expect(JSON.parse(apiRequest.mock.calls[3][1].body)).toMatchObject({
      projectId: "proj_1",
      uploadSessionId: "upload_1",
    });
  });
});
