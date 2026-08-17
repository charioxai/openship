import { describe, expect, it } from "vitest";

import {
  consumeCharioxRuntimeControls,
  deploymentPortBindings,
  strictPublicationHostConfig,
} from "./docker";

describe("Chariox strict publication runtime controls", () => {
  const controls = {
    CHARIOX_OPENSHIP_RUNTIME_PROFILE: "strict-publication-v1",
    CHARIOX_OPENSHIP_NETWORK_MODE: "chariox-pub-egress-demo-0123456789-n",
    CHARIOX_OPENSHIP_CONTAINER_NAME: "chariox-publication-demo-0123456789",
  };

  it("strips internal controls before tenant environment construction", () => {
    expect(consumeCharioxRuntimeControls({
      APP_VALUE: "visible",
      ...controls,
      CHARIOX_OPENSHIP_READ_ONLY_BINDS_JSON: JSON.stringify([{
        source: "/var/lib/chariox/credentials/profiles/runtime-codex",
        target: "/home/chariox/.credential-bindings/000",
      }]),
    })).toEqual({
      environment: { APP_VALUE: "visible" },
      containerName: "chariox-publication-demo-0123456789",
      networkMode: "chariox-pub-egress-demo-0123456789-n",
      readOnlyBinds: [
        "/var/lib/chariox/credentials/profiles/runtime-codex:/home/chariox/.credential-bindings/000:ro",
      ],
      strictPublication: true,
    });
  });

  it("rejects arbitrary daemon network attachment", () => {
    expect(() => consumeCharioxRuntimeControls({
      ...controls,
      CHARIOX_OPENSHIP_NETWORK_MODE: "host",
    })).toThrow("Invalid Chariox publication egress network");
  });

  it("rejects a network override without the strict profile", () => {
    expect(() => consumeCharioxRuntimeControls({
      CHARIOX_OPENSHIP_NETWORK_MODE: "chariox-pub-egress-demo-0123456789-n",
    })).toThrow("Unsupported Chariox runtime profile");
  });

  it("rejects arbitrary host binds and duplicate runtime targets", () => {
    expect(() => consumeCharioxRuntimeControls({
      ...controls,
      CHARIOX_OPENSHIP_READ_ONLY_BINDS_JSON: JSON.stringify([{
        source: "/etc/shadow",
        target: "/home/chariox/.provider-credentials",
      }]),
    })).toThrow("Invalid Chariox publication bind controls");
    expect(() => consumeCharioxRuntimeControls({
      ...controls,
      CHARIOX_OPENSHIP_READ_ONLY_BINDS_JSON: JSON.stringify([
        {
          source: "/var/lib/chariox/credentials/profiles/runtime-a",
          target: "/home/chariox/.provider-credentials",
        },
        {
          source: "/var/lib/chariox/credentials/profiles/runtime-b",
          target: "/home/chariox/.provider-credentials",
        },
      ]),
    })).toThrow("Invalid Chariox publication bind controls");
  });

  it("disables IPv6 and direct host port routes for strict publications", () => {
    expect(strictPublicationHostConfig()).toMatchObject({
      Sysctls: {
        "net.ipv6.conf.all.disable_ipv6": "1",
        "net.ipv6.conf.default.disable_ipv6": "1",
      },
    });
    expect(deploymentPortBindings(3000, 43199, true)).toEqual({});
    expect(deploymentPortBindings(3000, 43199, false)).toEqual({
      "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "43199" }],
    });
    expect(deploymentPortBindings(3000, undefined, false)).toEqual({
      "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "" }],
    });
  });
});
