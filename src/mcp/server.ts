import { readRecentEvents, listTeamNames, getTeamSummary } from '../state/team-store.js';
import { readHudSnapshot } from '../hud/state.js';
import { renderHud } from '../hud/render.js';
import { loadProjectConfig } from '../config/project.js';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureTmuxPane, listTmuxPanes, listTmuxWindows } from '../tmux/session.js';
import { readTeamGraph } from '../orchestration/runtime.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'omg_project_status',
    description: 'Read oh-my-gemini project configuration and top-level runtime status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'omg_team_list',
    description: 'List all oh-my-gemini team names in the current project.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'omg_team_status',
    description: 'Read the full state summary for a specific team.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_hud_snapshot',
    description: 'Read the same aggregate state that powers the oh-my-gemini HUD.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
    },
  },
  {
    name: 'omg_recent_events',
    description: 'Read recent events for a specific team.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_dependency_blocks',
    description: 'Read dependency-blocked tasks and what each one is waiting on.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_ready_tasks',
    description: 'List pending tasks that have no unmet dependencies and can be executed now.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_worker_health',
    description: 'Read worker heartbeat and wait-reason information for a team.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_operator_brief',
    description: 'Read a concise operator handoff brief for a team with ready, blocked, and worker posture.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_graph',
    description: 'Read the dependency graph, ready tasks, and blocked edges for a team.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_panes',
    description: 'List tmux pane runtime details for a tmux-backed team.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_windows',
    description: 'List tmux windows for a tmux-backed team.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_team_capture',
    description: 'Capture recent tmux pane output for a tmux-backed team worker or pane id.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
        worker_name: { type: 'string' },
        pane_id: { type: 'string' },
        lines: { type: 'number' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'omg_hud_text',
    description: 'Render the current HUD as plain text.',
    inputSchema: {
      type: 'object',
      properties: {
        team_name: { type: 'string' },
      },
    },
  },
];

function debugLog(cwd: string, line: string): void {
  const logPath = process.env.OMG_MCP_LOG?.trim() || join(cwd, '.omg', 'logs', 'mcp-server.log');
  try {
    appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch {}
}

function toolTextResult(value: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

async function callTool(name: string, params: Record<string, unknown> | undefined, cwd: string): Promise<unknown> {
  switch (name) {
    case 'omg_project_status':
      return {
        config: await loadProjectConfig(cwd),
        teams: await listTeamNames(cwd),
      };
    case 'omg_team_list':
      return await listTeamNames(cwd);
    case 'omg_team_status': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) {
        throw new Error('team_name is required');
      }
      return await getTeamSummary(cwd, teamName);
    }
    case 'omg_hud_snapshot':
      return await readHudSnapshot(cwd, typeof params?.team_name === 'string' ? params.team_name : undefined);
    case 'omg_recent_events': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) {
        throw new Error('team_name is required');
      }
      const limit = typeof params?.limit === 'number' && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(100, Math.trunc(params.limit)))
        : 20;
      return await readRecentEvents(cwd, teamName, limit);
    }
    case 'omg_team_dependency_blocks': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      const summary = await getTeamSummary(cwd, teamName);
      if (!summary) return null;
      return {
        team_name: teamName,
        blocked_count: summary.dependencyBlockedTasks,
        blocks: summary.dependencyBlocks,
      };
    }
    case 'omg_team_ready_tasks': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      const summary = await getTeamSummary(cwd, teamName);
      if (!summary) return null;
      const blockedIds = new Set(summary.dependencyBlocks.map((block) => block.taskId));
      return {
        team_name: teamName,
        ready_tasks: summary.tasks
          .filter((task) => task.status === 'pending' && !blockedIds.has(task.id))
          .map((task) => ({
            id: task.id,
            subject: task.subject,
            worker_name: task.workerName,
            depends_on: task.dependsOn ?? [],
          })),
      };
    }
    case 'omg_team_worker_health': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      const summary = await getTeamSummary(cwd, teamName);
      if (!summary) return null;
      return {
        team_name: teamName,
        workers: summary.workers.map((worker) => ({
          name: worker.name,
          status: worker.status,
          task_id: worker.taskId,
          last_heartbeat_at: worker.lastHeartbeatAt,
          heartbeat_count: worker.heartbeatCount ?? 0,
          wait_reason: worker.waitReason,
        })),
      };
    }
    case 'omg_team_operator_brief': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      const summary = await getTeamSummary(cwd, teamName);
      if (!summary) return null;
      const waitingWorkers = summary.workers.filter((worker) => worker.status === 'waiting');
      const blockedIds = new Set(summary.dependencyBlocks.map((block) => block.taskId));
      const readyTasks = summary.tasks.filter((task) => task.status === 'pending' && !blockedIds.has(task.id));
      return {
        team_name: teamName,
        counts: summary.counts,
        ready_task_count: readyTasks.length,
        blocked_task_count: summary.dependencyBlockedTasks,
        waiting_worker_count: waitingWorkers.length,
        next_action: waitingWorkers.length > 0
          ? "Inspect blocked dependencies and waiting workers before reassigning tasks."
          : "Review ready tasks and launch posture before the next operator handoff.",
        focus: {
          waiting_workers: waitingWorkers.map((worker) => ({
            name: worker.name,
            task_id: worker.taskId,
            wait_reason: worker.waitReason,
          })),
          ready_tasks: readyTasks.map((task) => ({
            id: task.id,
            subject: task.subject,
            worker_name: task.workerName,
          })),
        },
      };
    }
    case 'omg_team_graph': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      return await readTeamGraph(cwd, teamName);
    }
    case 'omg_team_panes': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      const summary = await getTeamSummary(cwd, teamName);
      if (!summary) return null;
      if (summary.config.launchMode !== 'tmux' || !summary.config.tmuxSession) {
        return { team_name: teamName, launch_mode: summary.config.launchMode, panes: [] };
      }
      return {
        team_name: teamName,
        session: summary.config.tmuxSession,
        panes: listTmuxPanes(`${summary.config.tmuxSession}:workers`),
      };
    }
    case 'omg_team_windows': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      const summary = await getTeamSummary(cwd, teamName);
      if (!summary) return null;
      if (summary.config.launchMode !== 'tmux' || !summary.config.tmuxSession) {
        return { team_name: teamName, launch_mode: summary.config.launchMode, windows: [] };
      }
      return {
        team_name: teamName,
        session: summary.config.tmuxSession,
        windows: listTmuxWindows(summary.config.tmuxSession),
      };
    }
    case 'omg_team_capture': {
      const teamName = String(params?.team_name ?? '').trim();
      if (!teamName) throw new Error('team_name is required');
      const summary = await getTeamSummary(cwd, teamName);
      if (!summary) return null;
      if (summary.config.launchMode !== 'tmux' || !summary.config.tmuxSession) {
        throw new Error('team is not tmux-backed');
      }
      const lines = typeof params?.lines === 'number' && Number.isFinite(params.lines)
        ? Math.max(20, Math.min(1000, Math.trunc(params.lines)))
        : 200;
      const explicitPane = typeof params?.pane_id === 'string' ? params.pane_id.trim() : '';
      const workerName = typeof params?.worker_name === 'string' ? params.worker_name.trim() : '';
      const paneId = explicitPane
        || summary.workers.find((worker) => worker.name === workerName)?.paneId
        || summary.workers[0]?.paneId
        || '';
      if (!paneId) {
        throw new Error('no pane_id could be resolved');
      }
      return {
        team_name: teamName,
        pane_id: paneId,
        lines,
        content: captureTmuxPane(paneId, lines),
      };
    }
    case 'omg_hud_text': {
      const snapshot = await readHudSnapshot(cwd, typeof params?.team_name === 'string' ? params.team_name : undefined);
      return {
        text: renderHud(snapshot),
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function handleMcpRequest(request: JsonRpcRequest, cwd: string): Promise<unknown> {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: typeof request.params?.protocolVersion === 'string'
          ? request.params.protocolVersion
          : '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: 'oh-my-gemini-mcp',
          version: '0.2.0',
        },
      };
    case 'ping':
      return {};
    case 'resources/list':
      return { resources: [] };
    case 'prompts/list':
      return { prompts: [] };
    case 'tools/list':
      return { tools: TOOL_DESCRIPTORS };
    case 'tools/call': {
      const toolName = String(request.params?.name ?? '');
      const argumentsValue = (request.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(toolName, argumentsValue, cwd);
        return toolTextResult(result);
      } catch (error) {
        return toolTextResult(
          { error: error instanceof Error ? error.message : String(error) },
          true,
        );
      }
    }
    default:
      throw new Error(`Method not found: ${request.method}`);
  }
}

function writeMessage(cwd: string, message: Record<string, unknown>, mode: 'content-length' | 'ndjson'): void {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  debugLog(cwd, `out ${JSON.stringify(message)}`);
  if (mode === 'ndjson') {
    process.stdout.write(`${body.toString('utf8')}\n`);
    return;
  }
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function writeResponse(cwd: string, id: string | number | null | undefined, result: unknown, mode: 'content-length' | 'ndjson'): void {
  if (id === undefined) return;
  writeMessage(cwd, {
    jsonrpc: '2.0',
    id,
    result,
  }, mode);
}

function writeError(cwd: string, id: string | number | null | undefined, code: number, message: string, mode: 'content-length' | 'ndjson'): void {
  if (id === undefined) return;
  writeMessage(cwd, {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  }, mode);
}

export async function serveMcp(cwd: string): Promise<void> {
  let buffer = Buffer.alloc(0);
  let processing = false;

  async function drainBuffer(): Promise<void> {
    if (processing) return;
    processing = true;
    try {
      while (true) {
        let body: string | null = null;
        let responseMode: 'content-length' | 'ndjson' = 'content-length';

        const trimmedStart = buffer.toString('utf8', 0, Math.min(buffer.length, 32)).trimStart();
        if (trimmedStart.startsWith('Content-Length:')) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd < 0) return;

          const header = buffer.slice(0, headerEnd).toString('utf8');
          const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
          if (!contentLengthMatch) {
            buffer = Buffer.alloc(0);
            return;
          }
          const contentLength = Number.parseInt(contentLengthMatch[1] ?? '', 10);
          const messageStart = headerEnd + 4;
          const messageEnd = messageStart + contentLength;
          if (buffer.length < messageEnd) return;

          body = buffer.slice(messageStart, messageEnd).toString('utf8');
          buffer = buffer.slice(messageEnd);
          responseMode = 'content-length';
        } else {
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex < 0) return;
          body = buffer.slice(0, newlineIndex).toString('utf8').trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!body) {
            continue;
          }
          responseMode = 'ndjson';
        }

        let parsed: JsonRpcRequest;
        try {
          parsed = JSON.parse(body) as JsonRpcRequest;
          debugLog(cwd, `in ${body}`);
        } catch {
          debugLog(cwd, `invalid ${body}`);
          continue;
        }

        if (parsed.method === 'notifications/initialized') {
          continue;
        }

        try {
          const result = await handleMcpRequest(parsed, cwd);
          writeResponse(cwd, parsed.id, result, responseMode);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const code = message.startsWith('Method not found:') ? -32601 : -32603;
          writeError(cwd, parsed.id, code, message, responseMode);
        }
      }
    } finally {
      processing = false;
    }
  }

  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    drainBuffer();
  });

  process.stdin.resume();
}
