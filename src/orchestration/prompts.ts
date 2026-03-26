import { z } from "zod";
import { parseLooseJson } from '../utils/json.js';

// ---------- Zod schemas for Gemini response validation ----------

export const plannedTaskSchema = z.object({
  id: z.string().trim().optional(),
  subject: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.number().int().finite().optional(),
  depends_on: z.array(z.string().trim().min(1)).optional(),
});

export const workerOutcomeSchema = z.object({
  status: z.enum(["completed", "failed"]),
  summary: z.string().trim().min(1),
  changed_files: z.array(z.string().trim().min(1)).default([]),
  verification: z.array(z.string().trim().min(1)).default([]),
  notes: z.array(z.string().trim().min(1)).optional(),
});

export const planValidationSchema = z.object({
  verdict: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(1),
  issues: z.array(z.string().trim().min(1)).default([]),
});

// ---------- Type exports ----------

export type PlannedTask = z.infer<typeof plannedTaskSchema>;
export type WorkerOutcome = z.infer<typeof workerOutcomeSchema>;
export type PlanValidation = z.infer<typeof planValidationSchema>;

// ---------- Prompt builders ----------

export function buildPlannerPrompt(rootTask: string, maxTaskCount: number, refinementNotes: string[] = []): string {
  const lines = [
    'You are the planning engine for oh-my-gemini.',
    `Break the following root task into ${maxTaskCount} or fewer implementation tasks.`,
    'Return strict JSON only.',
    'The JSON must be an array of objects with these keys:',
    '[{"id":"task-1","subject":"...","description":"...","priority":5,"depends_on":["task-0"]}]',
    'Rules:',
    '- Each task should have a stable id like task-1, task-2.',
    '- Each task must be execution-ready.',
    '- Prefer independent work streams.',
    '- Use priority to indicate urgency/importance. Higher number means earlier scheduling.',
    '- If a task requires another task first, list it in depends_on.',
    '- Avoid meta tasks like "think more" or "discuss options".',
    '- Do not mention tool names, internal API names, or imagined command names unless absolutely necessary.',
    '- Describe work in plain implementation language.',
    '- Use concise but concrete descriptions.',
    '',
    `Root task: ${rootTask}`,
  ];

  if (refinementNotes.length > 0) {
    lines.push('');
    lines.push('Planner feedback from earlier rejected attempts:');
    for (const note of refinementNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('Use this feedback to produce a stronger replacement task graph.');
  }

  return lines.join('\n');
}

export function buildWorkerPrompt(input: {
  teamName: string;
  workerName: string;
  rootTask: string;
  subject: string;
  description: string;
}): string {
  return [
    `You are ${input.workerName} on team ${input.teamName}.`,
    `Root task: ${input.rootTask}`,
    `Assigned subtask subject: ${input.subject}`,
    `Assigned subtask description: ${input.description}`,
    '',
    'Complete only this subtask.',
    'Respect explicit read-only or no-file-change constraints if they appear in the root task or subtask.',
    'If you change code, verify the changed behavior as directly as possible.',
    'Return strict JSON only with this shape:',
    '{',
    '  "status": "completed" | "failed",',
    '  "summary": "short factual summary",',
    '  "changed_files": ["relative/path"],',
    '  "verification": ["command or proof"],',
    '  "notes": ["optional note"]',
    '}',
    'Do not wrap the JSON in markdown fences.',
  ].join('\n');
}

export function buildPlanCriticPrompt(rootTask: string, tasks: PlannedTask[]): string {
  return [
    'You are the plan critic for oh-my-gemini.',
    'Review the proposed task graph for clarity and executability.',
    'Return strict JSON only in this shape:',
    '{"verdict":"approve|reject","reason":"...","issues":["..."]}',
    'Reject if tasks are vague, meta-level, repetitive, or not directly executable.',
    'Reject if dependency ordering is suspicious, circular-looking, or unnecessary.',
    'Reject if task priority assignment looks random, flat, or inconsistent with urgency and unblock value.',
    'Approve only if the task graph is concrete enough for workers to execute without guessing.',
    '',
    `Root task: ${rootTask}`,
    `Proposed tasks: ${JSON.stringify(tasks)}`,
  ].join('\n');
}

export function buildPlanVerifierPrompt(rootTask: string, tasks: PlannedTask[]): string {
  return [
    'You are the plan verifier for oh-my-gemini.',
    'Check whether the proposed task graph has enough coverage and execution detail to safely proceed.',
    'Return strict JSON only in this shape:',
    '{"verdict":"approve|reject","reason":"...","issues":["..."]}',
    'Reject if the graph misses obvious implementation or verification work, if dependencies are unclear, or if tasks are too thin to execute safely.',
    'Reject if priorities do not make high-leverage or high-risk work start early enough.',
    'Reject if dependency structure would leave workers idle for avoidable reasons.',
    'Approve only if the graph appears complete enough for a bounded multi-worker run.',
    '',
    `Root task: ${rootTask}`,
    `Proposed tasks: ${JSON.stringify(tasks)}`,
  ].join('\n');
}

// ---------- Response parsers with zod validation ----------

export function parsePlannedTasks(text: string, maxTasks: number): PlannedTask[] {
  const parsed = parseLooseJson<unknown>(text);
  if (!Array.isArray(parsed)) {
    throw new Error('Planner response was not a JSON array');
  }

  const tasks: PlannedTask[] = [];
  for (const item of parsed) {
    const result = plannedTaskSchema.safeParse(item);
    if (!result.success) continue;
    tasks.push(result.data);
    if (tasks.length >= maxTasks) break;
  }

  if (tasks.length === 0) {
    throw new Error('Planner returned no valid tasks');
  }

  return tasks;
}

export function parseWorkerOutcome(text: string): WorkerOutcome {
  const parsed = parseLooseJson<unknown>(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Worker response was not a JSON object');
  }

  const result = workerOutcomeSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Worker response validation failed: ${result.error.message}`);
  }

  return result.data;
}

export function parsePlanValidation(text: string): PlanValidation {
  const parsed = parseLooseJson<unknown>(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Plan validation response was not a JSON object');
  }

  const result = planValidationSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Plan validation failed: ${result.error.message}`);
  }

  return result.data;
}
