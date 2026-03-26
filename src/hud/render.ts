import type { HudSnapshot } from './state.js';

export function renderHud(snapshot: HudSnapshot): string {
  const lines: string[] = [];
  lines.push(`OGX HUD  ${snapshot.projectName}`);
  lines.push(`cwd: ${snapshot.cwd}`);
  lines.push(`teams: total=${snapshot.teamCount} active=${snapshot.activeTeamCount} running=${snapshot.totalRunningTasks} completed=${snapshot.totalCompletedTasks} failed=${snapshot.totalFailedTasks}`);

  if (snapshot.teams.length === 0) {
    lines.push('no teams');
    return `${lines.join('\n')}\n`;
  }

  for (const team of snapshot.teams) {
    lines.push(
      `${team.name}  mode=${team.launchMode} workers=${team.activeWorkers}/${team.workerCount} ` +
      `pending=${team.counts.pending} ready=${team.readyTaskCount} running=${team.counts.running} waiting=${team.waitingWorkers} blocked=${team.dependencyBlockedTasks} completed=${team.counts.completed} failed=${team.counts.failed}`,
    );
    if (team.waitReasons && team.waitReasons.length > 0) {
      lines.push(`  wait: ${team.waitReasons.slice(0, 2).join(' | ')}`);
    }
    if (team.readyTaskIds.length > 0) {
      lines.push(`  ready: ${team.readyTaskIds.slice(0, 3).join(',')}`);
    }
    if (team.dependencyPreview && team.dependencyPreview.length > 0) {
      lines.push(`  graph: ${team.dependencyPreview.join(' | ')}`);
    }
    if (team.graphLines && team.graphLines.length > 0) {
      for (const graphLine of team.graphLines) {
        lines.push(`  node: ${graphLine}`);
      }
    }
    if (team.lastEvent) {
      lines.push(`  last: ${team.lastEvent}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
