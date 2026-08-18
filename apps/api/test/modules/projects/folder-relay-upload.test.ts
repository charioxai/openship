import "../mail/_setup-env";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  acceptRelayUpload,
  FolderUploadStateError,
} from "../../../src/modules/projects/folder/folder.service";
import type { FolderSession } from "../../../src/modules/projects/folder/session-store";

const execFileAsync = promisify(execFile);

async function archiveWith(name: string, content: string): Promise<Uint8Array> {
  const source = await mkdtemp(join(tmpdir(), "openship-folder-source-"));
  const archive = join(source, "source.tar.gz");
  await writeFile(join(source, name), content);
  await execFileAsync("tar", ["-czf", archive, "-C", source, name]);
  return readFile(archive);
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function relaySession(): Promise<FolderSession> {
  const stagingDir = await mkdtemp(join(tmpdir(), "openship-folder-stage-"));
  await writeFile(join(stagingDir, "stale.txt"), "must disappear");
  return {
    id: "folder_test",
    orgId: "org_1",
    userId: "user_1",
    principalId: "pat:token_1",
    mode: "api-relay",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    stagingDir,
    uploadTicket: "single-use",
    uploadState: "waiting",
    uploaded: false,
  };
}

describe("relay folder upload publication", () => {
  it("atomically replaces staging and consumes the ticket", async () => {
    const session = await relaySession();
    const archive = await archiveWith("current.txt", "current source");

    await acceptRelayUpload(session, stream(archive));

    expect(session.uploadState).toBe("uploaded");
    expect(session.uploadTicket).toBeUndefined();
    expect(await readFile(join(session.stagingDir!, "current.txt"), "utf8")).toBe("current source");
    await expect(readFile(join(session.stagingDir!, "stale.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(acceptRelayUpload(session, stream(archive))).rejects.toBeInstanceOf(
      FolderUploadStateError,
    );
  });

  it("rejects a concurrent replay before either request can publish twice", async () => {
    const session = await relaySession();
    const archive = await archiveWith("current.txt", "current source");
    let release!: () => void;
    const blocked = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(archive.subarray(0, 8));
        release = () => {
          controller.enqueue(archive.subarray(8));
          controller.close();
        };
      },
    });

    const first = acceptRelayUpload(session, blocked);
    await vi.waitFor(() => expect(session.uploadState).toBe("uploading"));
    await expect(acceptRelayUpload(session, stream(archive))).rejects.toThrow(
      "already in progress",
    );
    release();
    await first;
    expect(session.uploadState).toBe("uploaded");
  });

  it("keeps the prior staging tree and permits an exact retry after invalid bytes", async () => {
    const session = await relaySession();
    await expect(
      acceptRelayUpload(session, stream(new TextEncoder().encode("not a tarball"))),
    ).rejects.toBeDefined();
    expect(session.uploadState).toBe("waiting");
    expect(await readFile(join(session.stagingDir!, "stale.txt"), "utf8")).toBe("must disappear");

    await acceptRelayUpload(session, stream(await archiveWith("retry.txt", "retry source")));
    expect(await readFile(join(session.stagingDir!, "retry.txt"), "utf8")).toBe("retry source");
  });
});
