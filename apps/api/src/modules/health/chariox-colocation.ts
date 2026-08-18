import { createHmac } from "node:crypto";

export const CHARIOX_COLOCATION_CAPABILITY = "chariox-local-execution-v1";

export function createCharioxColocationAttestation(input: {
  secret: string | undefined;
  instanceId: string | undefined;
  requestedInstanceId: string | undefined;
  nonce: string | undefined;
}): { capability: string; instanceId: string; nonce: string; proof: string } | null {
  const secret = input.secret?.trim();
  const instanceId = input.instanceId?.trim();
  const nonce = input.nonce?.trim();
  if (!secret || !instanceId || input.requestedInstanceId !== instanceId || !nonce) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) return null;
  const proof = createHmac("sha256", secret)
    .update(`${CHARIOX_COLOCATION_CAPABILITY}\0${instanceId}\0${nonce}`)
    .digest("hex");
  return { capability: CHARIOX_COLOCATION_CAPABILITY, instanceId, nonce, proof };
}
