import { summarizeRuntimeStore } from "../dist/bin/runtime-store.js";
import {
  createApiIndexPayload,
  createHealthPayload,
  createMetaPayload,
  createReviewPackPayload,
  createRuntimeBriefPayload,
  createRuntimeScorecardPayload,
  createTeamSessionReplayPayload,
  runDoctor,
} from "../dist/bin/server.js";
import { summarizeTeamSessions } from "../dist/server/team-session-replay.js";

const telemetry = {
  doctorRuns: {
    failureCount: 0,
    lastDoctorAt: null,
    lastFailureAt: null,
    successCount: 0,
    total: 0,
    byScope: {
      project: 0,
      user: 0,
    },
  },
  routeCounts: {
    "/health": 1,
    "/meta": 1,
    "/v1/runtime-brief": 1,
    "/v1/review-pack": 1,
    "/v1/team-session-replay": 1,
    "/v1/runtime-scorecard": 1,
    "/api": 1,
  },
};

const port = 0;
const health = createHealthPayload(port);
const meta = createMetaPayload(port);
const brief = createRuntimeBriefPayload(port);
const review = createReviewPackPayload(port);
const replay = createTeamSessionReplayPayload(await summarizeTeamSessions());
const doctor = await runDoctor("project");
telemetry.doctorRuns.total = 1;
telemetry.doctorRuns.byScope.project = 1;
telemetry.doctorRuns.lastDoctorAt = new Date().toISOString();
if (doctor.ok === true) {
  telemetry.doctorRuns.successCount = 1;
} else {
  telemetry.doctorRuns.failureCount = 1;
  telemetry.doctorRuns.lastFailureAt = telemetry.doctorRuns.lastDoctorAt;
}
const scorecard = createRuntimeScorecardPayload(port, telemetry, summarizeRuntimeStore());
const api = createApiIndexPayload();

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      service: health.service,
      version: health.version ?? meta.version ?? null,
      runtime_mode: brief.runtime?.mode ?? null,
      doctor_ok: doctor.ok ?? null,
      doctor_status: doctor.ok ? "ok" : "degraded",
      review_claim_tier: review.proof_bundle?.product_truth?.claim_tier ?? null,
      review_route_count: Array.isArray(review.proof_bundle?.review_routes)
        ? review.proof_bundle.review_routes.length
        : null,
      public_route_count: meta.diagnostics?.route_count ?? null,
      api_route_count: Array.isArray(api.routes) ? api.routes.length : null,
      visible_teams: replay.summary?.visible_teams ?? null,
      persisted_events: scorecard.persistence?.event_count ?? null,
      operator_auth: scorecard.runtime?.operator_auth ?? null,
    },
    null,
    2
  )
);
