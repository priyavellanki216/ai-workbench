import { describe, expect, it } from "vitest";
import { splitIntoChunks } from "./retrieval";

describe("splitIntoChunks", () => {
  it("normalizes whitespace and keeps overlap-sized chunks bounded", () => {
    const input = Array.from({ length: 400 }, (_, index) => `sentence-${index}`).join("   ");
    const chunks = splitIntoChunks(input);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1200)).toBe(true);
    expect(chunks[0]).toContain("sentence-0");
    expect(chunks.at(-1)).toContain("sentence-399");
  });

  it("returns no chunks for empty input", () => {
    expect(splitIntoChunks("   ")).toEqual([]);
  });
});
