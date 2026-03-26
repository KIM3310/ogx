import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "../src/mcp/server.js";

describe("MCP server handleMcpRequest", () => {
  it("responds to initialize with protocol version and capabilities", async () => {
    const result = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      "/tmp"
    )) as Record<string, unknown>;

    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.serverInfo).toEqual({
      name: "oh-my-gemini-mcp",
      version: "0.2.0",
    });
    expect((result.capabilities as Record<string, unknown>).tools).toBeDefined();
  });

  it("uses default protocol version when none supplied", async () => {
    const result = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "initialize" },
      "/tmp"
    )) as Record<string, unknown>;

    expect(result.protocolVersion).toBe("2024-11-05");
  });

  it("responds to ping with empty object", async () => {
    const result = await handleMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "ping" },
      "/tmp"
    );
    expect(result).toEqual({});
  });

  it("lists tools with expected descriptors", async () => {
    const result = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
      "/tmp"
    )) as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };

    expect(result.tools.length).toBeGreaterThan(0);
    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain("omg_project_status");
    expect(toolNames).toContain("omg_team_list");
    expect(toolNames).toContain("omg_team_status");
    expect(toolNames).toContain("omg_hud_snapshot");
    expect(toolNames).toContain("omg_recent_events");
    expect(toolNames).toContain("omg_team_dependency_blocks");
    expect(toolNames).toContain("omg_team_ready_tasks");
    expect(toolNames).toContain("omg_team_worker_health");
    expect(toolNames).toContain("omg_team_operator_brief");
    expect(toolNames).toContain("omg_team_graph");
    expect(toolNames).toContain("omg_hud_text");
  });

  it("every tool descriptor has name, description, and inputSchema", async () => {
    const result = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "tools/list" },
      "/tmp"
    )) as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };

    for (const tool of result.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("returns empty resources list", async () => {
    const result = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 6, method: "resources/list" },
      "/tmp"
    )) as { resources: unknown[] };

    expect(result.resources).toEqual([]);
  });

  it("returns empty prompts list", async () => {
    const result = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 7, method: "prompts/list" },
      "/tmp"
    )) as { prompts: unknown[] };

    expect(result.prompts).toEqual([]);
  });

  it("throws on unknown method", async () => {
    await expect(
      handleMcpRequest({ jsonrpc: "2.0", id: 8, method: "unknown/method" }, "/tmp")
    ).rejects.toThrow(/Method not found/);
  });

  it("returns error content when tools/call receives missing team_name", async () => {
    const result = (await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "omg_team_status", arguments: {} },
      },
      "/tmp"
    )) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain("team_name is required");
  });

  it("returns error content for unknown tool name", async () => {
    const result = (await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "nonexistent_tool", arguments: {} },
      },
      "/tmp"
    )) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });

  it("tools/call omg_team_list returns content array for empty project", async () => {
    const result = (await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "omg_team_list", arguments: {} },
      },
      "/tmp/nonexistent-project-dir"
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
  });
});
