# Contributing to chrome-dev-tools

Thanks for your interest in improving `chrome-dev-tools`.

## Setup

```bash
git clone https://github.com/lallenlowe/pi-chrome-dev-tools.git
cd pi-chrome-dev-tools
npm install
npm run typecheck
```

## Developing locally

Make changes in `src/`, then:

```bash
npm run typecheck
pi install "$PWD"
```

Start pi and test your changes with the `chrome_*` tools.

## Code conventions

- Strict TypeScript, no implicit `any`
- Small, focused changes over broad rewrites
- Keep tool descriptions clear and user-facing
- Avoid adding dependencies unless necessary
- Update README and CHANGELOG when behavior changes

## Adding a new tool

1. Create `src/tools/<name>.ts` following existing tool patterns
2. Export and register it in `src/index.ts`
3. Add it to the SKILL.md tool table
4. Document in README.md and note in CHANGELOG.md
5. Run `npm run typecheck`

## Pull requests

1. Fork and create a focused branch
2. Run `npm run typecheck` and test locally with `pi install`
3. Update docs for user-visible changes
4. Open a PR against `main`
