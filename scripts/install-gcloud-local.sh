#!/usr/bin/env bash
set -euo pipefail

ROOT="${HOME}/.local/google-cloud-sdk"
BIN_DIR="${HOME}/.local/bin"
OS="darwin"
ARCH="arm"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer currently targets macOS." >&2
  exit 1
fi

if [[ "$(uname -m)" == "x86_64" ]]; then
  ARCH="x86_64"
fi

mkdir -p "${BIN_DIR}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ARCHIVE="google-cloud-cli-${OS}-${ARCH}.tar.gz"
URL="https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/${ARCHIVE}"

echo "[install-gcloud-local] downloading ${URL}"
curl -fsSL "${URL}" -o "${TMP_DIR}/${ARCHIVE}"

echo "[install-gcloud-local] extracting to ${HOME}/.local"
tar -xzf "${TMP_DIR}/${ARCHIVE}" -C "${HOME}/.local"

ln -sf "${ROOT}/bin/gcloud" "${BIN_DIR}/gcloud"
ln -sf "${ROOT}/bin/gsutil" "${BIN_DIR}/gsutil"
ln -sf "${ROOT}/bin/bq" "${BIN_DIR}/bq"

echo "[install-gcloud-local] installed"
"${BIN_DIR}/gcloud" --version | head -n 2
echo
echo "Add to PATH if needed:"
echo "  export PATH=\"${BIN_DIR}:\$PATH\""

