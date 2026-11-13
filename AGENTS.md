This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Sprint Tasks & PR Workflow (CSE 115A)

For each course sprint task (spec: `cse115a-sprint-task-specifications.md`):

- **Task file location & format:** Create `docs/tasks/sprint-<N>/<task id>.md` with matching `sprint: <N>` and front matter (`id`, `story`, `sprint`, `assignee`, `estimate_hours`). Keep the exact headings and order from the course spec: `# <Title>`, `## Description`, `## Specs`, `## Requirements`, `## Acceptance criteria` (do not add extra headings).
- **Spec-first commit & base tag:** On a fresh branch `task/<task id>` from up-to-date `main`, commit **only** `docs/tasks/sprint-<N>/<task id>.md` first, tag `<task id>-base` on that commit, and push both (`git push origin task/<task id> <task id>-base`). Never amend, rebase, or force-push that commit after tagging.
- **Tests:** Add at least one test per acceptance criterion under `tests/`, with every test name prefixed by `<task id>` (e.g. `US-3.1-T-1: ...`). Run `npx expo lint`, `npx tsc --noEmit`, `npm test` (runs both `test:unit` and `test:ui`).
- **One task per PR & done tag:** Within `docs/tasks/`, a task PR must touch **only** its own `docs/tasks/sprint-<N>/<task id>.md`. Title the PR `<task id>: <title>`. After merging to `main`, tag `<task id>-done` on the merge commit and push it (`git push origin <task id>-done`). Separate repo-wide cleanup/setup belongs in its own non-submitted PR merged to `main` first (then `git merge origin/main`, never rebase).
