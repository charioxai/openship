import { describe, expect, it } from "vitest";

import {
  CHARIOX_COLOCATION_CAPABILITY,
  createCharioxColocationAttestation,
} from "../../src/modules/health/chariox-colocation";

const secret = "a".repeat(64);
const nonce = "b".repeat(43);

describe("Chariox co-location attestation", () => {
  it("binds the capability, configured instance, and caller nonce", () => {
    const result = createCharioxColocationAttestation({
      secret,
      instanceId: "vps2-openship",
      requestedInstanceId: "vps2-openship",
      nonce,
    });
    expect(result).toEqual({
      capability: CHARIOX_COLOCATION_CAPABILITY,
      instanceId: "vps2-openship",
      nonce,
      proof: "c536d333f51dd252ea433d98142428cc94a1fc8d623acc8695bd366908ffe791",
    });
  });

  it("does not disclose an attestation for missing or mismatched host identity", () => {
    expect(createCharioxColocationAttestation({
      secret,
      instanceId: "vps2-openship",
      requestedInstanceId: "other-host",
      nonce,
    })).toBeNull();
    expect(createCharioxColocationAttestation({
      secret: undefined,
      instanceId: "vps2-openship",
      requestedInstanceId: "vps2-openship",
      nonce,
    })).toBeNull();
    expect(createCharioxColocationAttestation({
      secret,
      instanceId: "vps2-openship",
      requestedInstanceId: "vps2-openship",
      nonce: "too-short",
    })).toBeNull();
  });
});
