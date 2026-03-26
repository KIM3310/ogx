import { describe, expect, it } from "vitest";
import { slugify, truncate, nowIso, timestampTag } from "../src/utils/strings.js";

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("collapses consecutive special characters into a single dash", () => {
    expect(slugify("a---b___c")).toBe("a-b-c");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("truncates to 64 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(64);
  });

  it("returns 'item' for empty or all-special input", () => {
    expect(slugify("")).toBe("item");
    expect(slugify("!!!")).toBe("item");
  });

  it("handles mixed alphanumeric and special characters", () => {
    expect(slugify("My Project (v2.0)")).toBe("my-project-v2-0");
  });
});

describe("truncate", () => {
  it("returns original string when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates with ellipsis when over limit", () => {
    const result = truncate("hello world", 6);
    expect(result.length).toBe(6);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("handles exact length boundary", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("nowIso", () => {
  it("returns a valid ISO timestamp", () => {
    const iso = nowIso();
    expect(new Date(iso).toISOString()).toBe(iso);
  });
});

describe("timestampTag", () => {
  it("produces a compact tag without colons or dashes", () => {
    const tag = timestampTag(new Date("2026-03-19T12:30:45.123Z"));
    expect(tag).toBe("20260319T123045Z");
    expect(tag).not.toContain("-");
    expect(tag).not.toContain(":");
  });
});
