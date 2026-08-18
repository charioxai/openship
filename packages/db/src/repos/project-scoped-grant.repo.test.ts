import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import { createProjectRepo } from "./project.repo";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function fixture() {
  const client = new PGlite("memory://");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await client.exec(`
    INSERT INTO organization (id, name, slug) VALUES ('org_1', 'Org', 'org');
    INSERT INTO project_app (id, organization_id, name, slug)
      VALUES ('app_1', 'org_1', 'Project', 'project');
  `);
  return { client, db, repo: createProjectRepo(db) };
}

const projectInput = {
  organizationId: "org_1",
  groupId: "app_1",
  name: "Project",
  slug: "project",
};

describe("scoped project creation transaction", () => {
  it("rolls back the project when its PAT grant cannot be inserted", async () => {
    const { db, repo } = await fixture();

    await expect(repo.createWithScopedPatGrant(projectInput, "pat_missing")).rejects.toBeDefined();

    expect(await db.query.project.findMany()).toHaveLength(0);
    expect(await db.query.personalAccessTokenGrant.findMany()).toHaveLength(0);
  });

  it("commits the project and exact authority together", async () => {
    const { client, db, repo } = await fixture();
    await client.exec("SET session_replication_role = replica;");
    await client.exec(`
      INSERT INTO personal_access_token
        (id, user_id, organization_id, name, token_prefix, token_hash, read_only, scoped, expires_at)
      VALUES
        ('pat_1', 'user_missing', 'org_1', 'Scoped creator', 'ops_test', 'hash', false, true, NULL);
    `);
    await client.exec("SET session_replication_role = origin;");

    const created = await repo.createWithScopedPatGrant(projectInput, "pat_1");

    expect((await db.query.project.findMany()).map((row) => row.id)).toEqual([created.id]);
    const grants = await db.query.personalAccessTokenGrant.findMany();
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      tokenId: "pat_1",
      resourceType: "project",
      resourceId: created.id,
      permissionsJson: '["read","write","admin"]',
    });
  });
});
