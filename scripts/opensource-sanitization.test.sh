#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

public_paths=(
  apps
  packages
  scripts
  specs
  README.md
  CLAUDE.md
  Makefile
  dev.sh
  package.json
  pnpm-workspace.yaml
  turbo.json
  compose.yaml
  compose.local.yaml
  compose.dev.yaml
  .env.example
  .github
  convergekit-mockups
)

private_org='ji''sr'
legacy_product='code''wiki'
account_id='205''569277996'
infra_repo='dev-infra''-management'
aws_region='ap-south''-1'
ecr_role='AWS_ECR_PUSH_ROLE''_ARN'
eks_cluster='EKS_CLUSTER''_NAME'
deploy_tool='argo'
forbidden_pattern="${private_org}|${legacy_product}|${private_org}-hr|${private_org}\\.net|convergekit\\.${private_org}|${account_id}|${infra_repo}|${aws_region}|${ecr_role}|${eks_cluster}|${deploy_tool}cd|\\b${deploy_tool}\\b"

for path in "${public_paths[@]}"; do
  [ -e "${path}" ] || continue
  if rg -n -i \
    --glob '!scripts/opensource-sanitization.test.sh' \
    --glob '!scripts/package-scope.test.sh' \
    "${forbidden_pattern}" \
    "${path}"; then
    printf 'FAIL: private or stale product identity remains in %s\n' "${path}" >&2
    exit 1
  fi
done

printf 'PASS: public tree contains no forbidden private identity strings.\n'
