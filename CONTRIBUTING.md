# Contributing to KISS Translator

Thank you for your interest in contributing to **KISS Translator**! Every contribution—whether a bug report, documentation improvement, translation update, or code change—helps make the project better.

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Before You Start

Make sure your contribution belongs in the right repository:

- **Core extension, userscript, web UI, Local AI, file translation**: this repository (`fishjar/kiss-translator`)
- **Provider plugins & custom API adapters**: [kiss-translator-plugins](https://github.com/fishjar/kiss-translator-plugins)
- **Website translation rules**: [kiss-rules](https://github.com/fishjar/kiss-rules)
- **Self-hosted sync server**: [kiss-worker](https://github.com/fishjar/kiss-worker)

For architecture, local setup, build targets, and debugging tips, see [docs/DEVELOPER.md](docs/DEVELOPER.md).

## Branching Model

This repository uses a two-branch workflow:

- `dev`: default development and integration branch. **All pull requests must be based on and target `dev`.**
- `master`: production release branch. Direct pushes to `master` are forbidden; releases are merged from `dev` by maintainers via release PRs (see [VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md)).

## Development Workflow

1. **Fork and clone** the repository:

   ```sh
   git clone https://github.com/<your-username>/kiss-translator.git
   cd kiss-translator
   git checkout dev
   pnpm install
   ```

2. **Create a descriptive branch** from `dev`:
   - `feat/<short-description>` for new features
   - `fix/<short-description>` for bug fixes
   - `docs/<short-description>` for documentation updates
   - `refactor/<short-description>` or `chore/<short-description>` for maintenance

3. **Make focused changes**:
   - Keep PRs scoped to a single feature, bug fix, or topic.
   - Do **not** manually bump version numbers in `package.json`, `.env`, or `public/manifest*.json`.
   - Do **not** commit generated build outputs (`build/`), temporary files (`tmp/`), or local debug logs.
   - If you modify Lucide icon bindings, run `pnpm gen:icons` and verify with `pnpm test:icons-gen`.
   - Include concise, meaningful comments for newly added or modified non-trivial logic (explaining intent, edge cases, or invariants rather than restating obvious code).

4. **Run local checks before opening a PR**:

   ```sh
   pnpm check:pr
   ```

   `pnpm check:pr` runs Prettier formatting, icon generation tests, and `CI=true` production builds for Web, iOS userscript, rules JSON, and Chrome extension (warnings are treated as errors under `CI=true`).

   Also run the unit tests relevant to your changes (Jest via `CI=true pnpm test --watch=false <path>`, Vitest via `pnpm test:local-ai`, or Node tests such as `pnpm test:build`). See [docs/DEVELOPER.md](docs/DEVELOPER.md) for the full test matrix.

5. **Commit messages**:
   - Follow [Conventional Commits](https://www.conventionalcommits.org/) style where practical, e.g.:
     - `feat(subtitle): support ...`
     - `fix(translator): resolve ...`
     - `docs: update developer guide`
     - `style: format code`
     - `chore: update dependency`

6. **Open a Pull Request**:
   - Target the `dev` branch.
   - Fill out the PR template clearly, including reproduction/verification steps and affected platforms (Chrome/Edge, Firefox, Userscript, Web).
   - Reference related issues (e.g., `Closes #123`).

## AI-Assisted Contributions

AI coding assistants are welcome in this project, provided contributors follow the same engineering standards as human-written code:

- **Understand your diff**: You are responsible for every line you submit. Be prepared to explain design choices and respond to review feedback.
- **Verify locally**: Always run `pnpm check:pr` and relevant tests yourself before opening a PR. Do not submit unverified or speculative bulk edits.
- **Follow repository guidelines**: If you use an AI agent, point it to [AGENTS.md](AGENTS.md) so it follows the repository's constraints and conventions.

## Reporting Bugs & Requesting Features

- Search existing [Issues](https://github.com/fishjar/kiss-translator/issues) before opening a new one.
- Use the provided [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) or [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template and include your browser, software type (Extension vs. Userscript), and version number.
