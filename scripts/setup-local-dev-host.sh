#!/usr/bin/env bash
set -euo pipefail

HOSTNAME="${CONVERGEKIT_LOCAL_HOSTNAME:-convergekit-dev.local}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${REPO_ROOT}/.local/certs"
CERT_FILE="${CERT_DIR}/${HOSTNAME}.pem"
KEY_FILE="${CERT_DIR}/${HOSTNAME}-key.pem"

if ! command -v mkcert >/dev/null 2>&1; then
  cat >&2 <<'EOF'
mkcert is required to create a locally trusted HTTPS certificate.

Install it on macOS with:
  brew install mkcert nss

Then run:
  make compose:setup-host
EOF
  exit 1
fi

mkdir -p "${CERT_DIR}"

if ! grep -Eq "[[:space:]]${HOSTNAME}([[:space:]]|$)" /etc/hosts; then
  echo "Adding ${HOSTNAME} to /etc/hosts. This requires sudo."
  printf '127.0.0.1 %s\n' "${HOSTNAME}" | sudo tee -a /etc/hosts >/dev/null
else
  echo "/etc/hosts already contains ${HOSTNAME}."
fi

echo "Installing the local mkcert CA if needed..."
mkcert -install

echo "Generating local certificate:"
echo "  ${CERT_FILE}"
echo "  ${KEY_FILE}"
mkcert -cert-file "${CERT_FILE}" -key-file "${KEY_FILE}" "${HOSTNAME}" localhost 127.0.0.1 ::1

cat <<EOF

Local HTTPS is ready.

Use:
  https://${HOSTNAME}

Workforce SSO dev SAML values:
  ACS URL:   https://${HOSTNAME}/api/auth/workforce-saml/acs
  Entity ID: urn:convergekit:dev
  Start URL: https://${HOSTNAME}/en/auth/sign-in
EOF
