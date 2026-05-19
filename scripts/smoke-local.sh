#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${WEB_URL:-https://convergekit-dev.local}"
API_URL="${API_URL:-${WEB_URL}}"
SMOKE_EMAIL="${CONVERGEKIT_SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${CONVERGEKIT_SMOKE_PASSWORD:-}"
RUN_CHAT="${CONVERGEKIT_SMOKE_CHAT:-1}"
CURL_TLS_ARGS=()

if [[ "${CONVERGEKIT_SMOKE_INSECURE:-0}" == "1" ]]; then
  CURL_TLS_ARGS=(-k)
fi

if [[ -z "${SMOKE_EMAIL}" || -z "${SMOKE_PASSWORD}" ]]; then
  cat >&2 <<'EOF'
CONVERGEKIT_SMOKE_EMAIL and CONVERGEKIT_SMOKE_PASSWORD are required.

Example:
  CONVERGEKIT_SMOKE_EMAIL=user@example.com CONVERGEKIT_SMOKE_PASSWORD='...' make smoke:local
EOF
  exit 2
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

cookies="${tmpdir}/cookies.txt"
body="${tmpdir}/body.json"
headers="${tmpdir}/headers.txt"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

json_field() {
  local expression="$1"
  node -e "
    const fs = require('fs')
    const input = fs.readFileSync(0, 'utf8')
    const data = JSON.parse(input)
    const result = (${expression})(data)
    if (typeof result === 'object') console.log(JSON.stringify(result))
    else console.log(result ?? '')
  "
}

request() {
  local method="$1"
  local url="$2"
  local data_file="${3:-}"
  local status

  if [[ -n "${data_file}" ]]; then
    status="$(
      curl -sS -D "${headers}" -b "${cookies}" -c "${cookies}" \
        "${CURL_TLS_ARGS[@]}" \
        -H 'Content-Type: application/json' \
        -H "Origin: ${WEB_URL}" \
        -X "${method}" \
        --data @"${data_file}" \
        -o "${body}" \
        -w '%{http_code}' \
        "${url}"
    )"
  else
    status="$(
      curl -sS -D "${headers}" -b "${cookies}" -c "${cookies}" \
        "${CURL_TLS_ARGS[@]}" \
        -X "${method}" \
        -o "${body}" \
        -w '%{http_code}' \
        "${url}"
    )"
  fi

  printf '%s' "${status}"
}

expect_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"

  if [[ "${actual}" != "${expected}" ]]; then
    printf 'Response body for %s:\n' "${label}" >&2
    sed -n '1,40p' "${body}" >&2
    fail "${label} returned ${actual}, expected ${expected}"
  fi
}

expect_non_5xx() {
  local actual="$1"
  local label="$2"

  if [[ "${actual}" == 5* ]]; then
    printf 'Response body for %s:\n' "${label}" >&2
    sed -n '1,40p' "${body}" >&2
    fail "${label} returned ${actual}"
  fi
}

printf 'Checking API health at %s...\n' "${API_URL}"
expect_status "200" "$(request GET "${API_URL}/api/health")" "API health"

printf 'Checking web sign-in page at %s...\n' "${WEB_URL}"
expect_status "200" "$(request GET "${WEB_URL}/en/auth/sign-in")" "web sign-in page"

node -e "
  const fs = require('fs')
  fs.writeFileSync(
    '${tmpdir}/login.json',
    JSON.stringify({
      email: process.env.CONVERGEKIT_SMOKE_EMAIL,
      password: process.env.CONVERGEKIT_SMOKE_PASSWORD,
    }),
  )
"

printf 'Signing in through same-origin web API proxy...\n'
expect_status "200" \
  "$(request POST "${WEB_URL}/api/auth/sign-in/email" "${tmpdir}/login.json")" \
  "same-origin email sign-in"

printf 'Checking proxied session and repository list...\n'
expect_status "200" "$(request GET "${WEB_URL}/api/auth/get-session")" "same-origin session"
expect_status "200" "$(request GET "${WEB_URL}/api/repositories")" "same-origin repositories API"

repository_id="$(json_field 'data => data.repositories?.[0]?.id' <"${body}")"
repository_name="$(json_field 'data => data.repositories?.[0]?.name' <"${body}")"
if [[ -z "${repository_id}" ]]; then
  fail 'no repositories available for the smoke user'
fi

printf 'Using repository %s (%s).\n' "${repository_name}" "${repository_id}"

expect_status "200" "$(request GET "${WEB_URL}/en/repositories")" "repositories page"
expect_non_5xx "$(request GET "${WEB_URL}/en/repositories/${repository_id}")" "repository detail page"
expect_non_5xx "$(request GET "${WEB_URL}/en/repositories/${repository_id}/wiki")" "repository wiki page"

printf 'Checking document listing hides internal paths...\n'
expect_status "200" "$(request GET "${WEB_URL}/api/documents?repositoryId=${repository_id}")" "documents API"
contains_mindmap="$(json_field 'data => (data.documents ?? []).some((doc) => doc.path === "__mindmap__") ? "yes" : "no"' <"${body}")"
if [[ "${contains_mindmap}" != "no" ]]; then
  fail 'documents API exposed __mindmap__'
fi

printf 'Checking MCP token lifecycle...\n'
token_label="local-smoke-$(node -e 'process.stdout.write(String(Date.now()))')"
SMOKE_TOKEN_LABEL="${token_label}" node -e "require('fs').writeFileSync('${tmpdir}/token.json', JSON.stringify({ label: process.env.SMOKE_TOKEN_LABEL }))"
expect_status "201" \
  "$(request POST "${WEB_URL}/api/repositories/${repository_id}/mcp-tokens" "${tmpdir}/token.json")" \
  "create MCP token"

token_present="$(json_field 'data => typeof data.token === "string" && data.token.length > 0 ? "yes" : "no"' <"${body}")"
if [[ "${token_present}" != "yes" ]]; then
  fail 'create MCP token did not return one-time token'
fi

expect_status "200" "$(request GET "${WEB_URL}/api/repositories/${repository_id}/mcp-tokens")" "list MCP tokens"
token_id="$(SMOKE_TOKEN_LABEL="${token_label}" json_field 'data => data.tokens?.find((token) => token.label === process.env.SMOKE_TOKEN_LABEL && token.revokedAt == null)?.id' <"${body}")"
if [[ -z "${token_id}" ]]; then
  fail 'created MCP token was not listed'
fi

expect_status "200" \
  "$(request GET "${WEB_URL}/api/repositories/${repository_id}/mcp-tokens/${token_id}/config")" \
  "MCP token config"
expect_status "204" \
  "$(request DELETE "${WEB_URL}/api/repositories/${repository_id}/mcp-tokens/${token_id}")" \
  "revoke MCP token"

if [[ "${RUN_CHAT}" == "1" ]]; then
  printf 'Checking chat through same-origin web route...\n'
  node -e "
    require('fs').writeFileSync(
      '${tmpdir}/session.json',
      JSON.stringify({ repositoryId: '${repository_id}' }),
    )
  "
  expect_status "201" "$(request POST "${WEB_URL}/api/chat/sessions" "${tmpdir}/session.json")" "create chat session"
  session_id="$(json_field 'data => data.session?.id' <"${body}")"
  if [[ -z "${session_id}" ]]; then
    fail 'chat session was not created'
  fi

  node -e "
    require('fs').writeFileSync(
      '${tmpdir}/chat.json',
      JSON.stringify({
        sessionId: '${session_id}',
        repositoryId: '${repository_id}',
        messages: [
          {
            id: 'local-smoke-user-message',
            role: 'user',
            parts: [{ type: 'text', text: 'What does this repository do?' }],
          },
        ],
      }),
    )
  "
  expect_status "200" "$(request POST "${WEB_URL}/api/chat" "${tmpdir}/chat.json")" "chat stream"
else
  printf 'Skipping chat smoke because CONVERGEKIT_SMOKE_CHAT=%s.\n' "${RUN_CHAT}"
fi

printf 'PASS: local production-shape smoke checks passed.\n'
