import { describe, expect, it } from "vitest";
import {
  assertPositiveInt,
  assertSafeTeamName,
  assertSafeWorkerId,
  parseScope,
} from "../src/utils/validate.js";

describe("validate", () => {
  it("parses valid scope", () => {
    expect(parseScope("user")).toBe("user");
    expect(parseScope("project")).toBe("project");
  });

  it("rejects invalid scope", () => {
    expect(() => parseScope("invalid")).toThrow(/Invalid scope/);
  });

  it("validates team and worker ids", () => {
    expect(assertSafeTeamName("alpha-team_1")).toBe("alpha-team_1");
    expect(assertSafeWorkerId("w1")).toBe("w1");

    expect(() => assertSafeTeamName("../../oops")).toThrow(/Invalid team name/);
    expect(() => assertSafeWorkerId("bad id")).toThrow(/Invalid worker id/);
  });

  it("validates positive integers", () => {
    expect(assertPositiveInt(2, "workers")).toBe(2);
    expect(() => assertPositiveInt(0, "workers")).toThrow(/positive integer/);
  });
});
