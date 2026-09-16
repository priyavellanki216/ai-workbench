import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx: TrpcContext = {
  user: null,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("workspace.demoSnapshot", () => {
  it("returns explicitly labeled demo telemetry", async () => {
    const snapshot = await appRouter.createCaller(ctx).workspace.demoSnapshot();

    expect(snapshot.source).toBe("seeded-demo-snapshot");
    expect(snapshot.groundedness).toBeGreaterThan(0);
    expect(snapshot.citationAccuracy).toBeGreaterThan(snapshot.groundedness);
    expect(snapshot.medianLatencyMs).toBeGreaterThan(0);
  });
});
