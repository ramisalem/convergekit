# Contributing to Colab Ai Hub

Thanks for helping improve Colab Ai Hub.

## Local Development

1. Install Node.js 20+ and pnpm 9.15.0.
2. Copy `.env.example` to `.env` and set the provider credentials you use locally.
3. Run `make install`.
4. Run `make compose:dev`.

## Checks

Before opening a pull request, run:

```bash
make verify
```

## Commits and Pull Requests

- Use concise imperative commit subjects, such as `Add repository summary`.
- Prefer Conventional Commits for feature and fix work: `feat:`, `fix:`,
  `docs:`, `test:`, `refactor:`, `chore:`.
- Keep one logical change per commit. Do not mix formatting-only changes with
  behavior changes.
- Pull requests are merged with a linear history. Use squash or rebase instead
  of merge commits.
- Branches are deleted after merge.

## Versioning

Colab Ai Hub follows SemVer for releases once public packages or tagged
artifacts are published. Until the first public release, changes may land under
the `0.x` line while APIs and deployment contracts settle.

## Style

- Use TypeScript strict mode.
- Keep user-facing behavior covered by focused tests.
- Prefer small, behavior-preserving changes over broad rewrites.
- Never commit real secrets, private repository tokens, or provider API keys.
