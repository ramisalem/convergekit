import { accessPolicyConfig } from '@convergekit/config/access-policy'

// Text PKs (user/groups) use these string ids; uuid PKs (repository/branch/
// document) use the reserved UUID constants below. Auto-id'd rows (sessions,
// mcp_tokens, oauth tokens/codes) are torn down by userId/repositoryId.
export const SMOKE = {
  GROUP_ID: 'smoke_mcp_group',
  USER_A_ID: 'smoke_mcp_user_a',
  USER_B_ID: 'smoke_mcp_user_b',
  REPO_ID: '5305c0de-0000-4000-8000-000000000001',
  BRANCH_ID: '5305c0de-0000-4000-8000-000000000002',
  DOC_ID: '5305c0de-0000-4000-8000-000000000003',
  DOC_PATH: 'README.md',
  DOC_CONTENT: '# Smoke MCP Fixture\n\nThis repository exists only for the MCP OAuth smoke suite.\n',
  STATIC_TOKEN_LABEL: 'smoke-mcp-static',
} as const

// Derived from the resolved access policy so they always satisfy the running api.
export const SMOKE_EMAIL_A = `smoke-mcp-a@${accessPolicyConfig.allowedEmailDomain}`
export const SMOKE_EMAIL_B = `smoke-mcp-b@${accessPolicyConfig.allowedEmailDomain}`
export const SMOKE_CLONE_URL = `https://${accessPolicyConfig.allowedRepositoryHost}/${accessPolicyConfig.allowedGitHubOrg}/smoke-mcp-fixture.git`
