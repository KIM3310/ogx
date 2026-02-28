#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-${PROJECT_ID:-}}"
REGION="${GCP_REGION:-asia-northeast3}"
SERVICE_NAME="${SERVICE_NAME_API:-oh-my-gemini-api}"
ARTIFACT_REPO="${ARTIFACT_REPO:-oh-my-gemini}"
ALLOW_UNAUTH="${ALLOW_UNAUTH:-1}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Missing project id. Set GCP_PROJECT_ID or PROJECT_ID." >&2
  exit 1
fi

GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
if ! command -v "${GCLOUD_BIN}" >/dev/null 2>&1; then
  echo "gcloud not found. Run scripts/install-gcloud-local.sh first." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

echo "[deploy-cloud-run] project=${PROJECT_ID} region=${REGION} service=${SERVICE_NAME}"
"${GCLOUD_BIN}" config set project "${PROJECT_ID}" >/dev/null

echo "[deploy-cloud-run] enabling services"
"${GCLOUD_BIN}" services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com >/dev/null

if ! "${GCLOUD_BIN}" artifacts repositories describe "${ARTIFACT_REPO}" --location "${REGION}" >/dev/null 2>&1; then
  echo "[deploy-cloud-run] creating Artifact Registry repo ${ARTIFACT_REPO}"
  "${GCLOUD_BIN}" artifacts repositories create "${ARTIFACT_REPO}" \
    --repository-format docker \
    --location "${REGION}" \
    --description "oh-my-gemini images" >/dev/null
fi

echo "[deploy-cloud-run] building image ${IMAGE}"
"${GCLOUD_BIN}" builds submit --tag "${IMAGE}" .

DEPLOY_ARGS=(
  run deploy "${SERVICE_NAME}"
  --image "${IMAGE}"
  --region "${REGION}"
  --platform managed
  --set-env-vars "NODE_ENV=production,OGX_CLOUD_RUN=1"
)

if [[ "${ALLOW_UNAUTH}" == "1" ]]; then
  DEPLOY_ARGS+=(--allow-unauthenticated)
else
  DEPLOY_ARGS+=(--no-allow-unauthenticated)
fi

echo "[deploy-cloud-run] deploying service"
"${GCLOUD_BIN}" "${DEPLOY_ARGS[@]}" >/tmp/ogx-cloudrun-deploy.log

URL="$("${GCLOUD_BIN}" run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')"
echo "[deploy-cloud-run] deployed: ${URL}"
echo "[deploy-cloud-run] health: ${URL}/health"

