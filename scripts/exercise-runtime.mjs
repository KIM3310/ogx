import { createApiServer } from "../dist/bin/server.js";

const token = (process.env.OGX_OPERATOR_TOKEN || "").trim();

async function fetchJson(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

const server = createApiServer(0);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("failed to resolve ogx exercise port");
}
const baseUrl = process.env.OGX_BASE_URL || `http://127.0.0.1:${address.port}`;

try {
  const headers = {};
  if (token) {
    headers["x-operator-token"] = token;
  }

  const health = await fetchJson("/health");
  const brief = await fetchJson("/v1/runtime-brief");
  const doctor = await fetchJson("/v1/doctor", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ scope: "project" }),
  });
  const scorecard = await fetchJson("/v1/runtime-scorecard");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        service: health.service,
        runtime_mode: brief.runtime?.mode ?? null,
        doctor_ok: doctor.result?.ok ?? null,
        persisted_events: scorecard.persistence?.event_count ?? null,
        operator_auth: scorecard.runtime?.operator_auth ?? null,
      },
      null,
      2
    )
  );
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}
