import { describe, expect, it } from "vitest";
import { parseLooseJson } from "../src/utils/json.js";

describe("parseLooseJson", () => {
  it("parses plain JSON object", () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses plain JSON array", () => {
    expect(parseLooseJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("returns null for empty string", () => {
    expect(parseLooseJson("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseLooseJson("   ")).toBeNull();
  });

  it("extracts JSON from fenced code block", () => {
    const input = '```json\n{"key":"value"}\n```';
    expect(parseLooseJson(input)).toEqual({ key: "value" });
  });

  it("extracts JSON from unfenced code block", () => {
    const input = '```\n{"key":"value"}\n```';
    expect(parseLooseJson(input)).toEqual({ key: "value" });
  });

  it("extracts balanced JSON embedded in prose", () => {
    const input = 'Here is the result: {"found": true} and more text';
    expect(parseLooseJson(input)).toEqual({ found: true });
  });

  it("handles nested objects in balanced extraction", () => {
    const input = 'output: {"a": {"b": 1}}';
    expect(parseLooseJson(input)).toEqual({ a: { b: 1 } });
  });

  it("handles nested arrays in balanced extraction", () => {
    const input = "data: [[1,2],[3,4]]";
    expect(parseLooseJson(input)).toEqual([[1, 2], [3, 4]]);
  });

  it("returns null for completely invalid input", () => {
    expect(parseLooseJson("just some text")).toBeNull();
  });

  it("handles strings with escaped quotes inside JSON", () => {
    const input = '{"msg": "say \\"hello\\""}';
    expect(parseLooseJson(input)).toEqual({ msg: 'say "hello"' });
  });
});
