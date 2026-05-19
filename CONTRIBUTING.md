# Contributing to ConvergeKit

Thanks for helping improve ConvergeKit.

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

## Style

- Use TypeScript strict mode.
- Keep user-facing behavior covered by focused tests.
- Prefer small, behavior-preserving changes over broad rewrites.
- Never commit real secrets, private repository tokens, or provider API keys.
