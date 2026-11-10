---
name: release-kiss-translator
description: Safely automate a complete KISS Translator release using the repository's version scripts, Chinese CHANGELOG convention, dev-to-master pull request flow, annotated version tags, and GitHub Actions release workflow. Use when asked to bump the project version, prepare a release, update release notes, create and merge the release PR, publish a version tag, or complete the end-to-end KISS Translator release process without intermediate confirmations.
---

# Release KISS Translator

Follow `VERSION_MANAGEMENT.md` and the repository's current scripts and workflow files. Use `package.json`'s `version` for the tag, extension packages and userscripts. Its `extensionStoreVersion` tracks the version available in extension stores. Never perform only part of a requested full release silently: report the exact completed stage and any remaining gate.

## Safety rules

- Treat a request to complete a release as authorization to merge the release PR and create and push the release tag after every required check passes. Do not pause for confirmation at either step.
- Never push commits directly to `master`, force-push, overwrite a tag, bypass a failed check, or merge a release PR before all required checks pass.
- Stop on a dirty worktree, a branch other than `dev`, divergent local/remote branches, invalid GitHub authentication, an existing target tag, version disagreement, unexpected formatted files, failed checks, or failed builds.
- Do not stash, reset, discard, or absorb unrelated user changes. Do not repair authentication or change repository settings without a separate request.
- Use the repository's existing `pnpm version:*` commands. Do not manually edit `.env` or manifest versions.

## 1. Inspect and choose the release

1. Read `VERSION_MANAGEMENT.md`, `package.json`, the top of `CHANGELOG.md`, `src/scripts/update-version.mjs`, `src/scripts/sync-version.mjs`, and `.github/workflows/release.yml`. Current repository files override examples in this skill.
2. Run read-only preflight checks:

   ```bash
   git status --short --branch
   git branch --show-current
   git fetch origin --prune --tags
   git rev-list --left-right --count dev...origin/dev
   gh auth status
   git tag --sort=-version:refname
   ```

3. Require a clean worktree, `dev`, and `dev...origin/dev` equal to `0 0`; then run `git pull --ff-only origin dev` and recheck.
4. If the user did not specify the bump, ask them to choose `patch`, `minor`, `major`, or an exact SemVer version. Do not infer the release class from commits.
5. Compute the target version before changing files. Verify that `v<target>` does not exist locally or remotely and that no open `dev` to `master` release PR conflicts with this release.

## 2. Prepare the release on dev

1. Run exactly one matching command:

   ```bash
   pnpm version:patch
   pnpm version:minor
   pnpm version:major
   pnpm version:set -- <version>
   ```

2. Confirm `package.json`'s `version`, `.env`, `public/manifest.json`, `public/manifest.firefox.json`, and `public/manifest.thunderbird.json` all contain the target version. Advance `extensionStoreVersion` only when the new extension version is available in stores.
3. Find the latest version tag with `git tag --sort=-version:refname`. Review `git log --oneline --no-merges <latest-tag>..HEAD`, then prepend one `## v<target>` section to `CHANGELOG.md`:
   - Write concise Chinese bullets describing user-visible changes.
   - Summarize behavior rather than copying commit messages mechanically.
   - Exclude merges, formatting-only work, and internal implementation detail unless release-relevant.
   - Preserve UTF-8 and every existing historical entry unchanged.
4. Run `pnpm format`, inspect `git diff --name-only` and `git diff`, and stop if formatting touched unrelated files. Do not silently include cleanup.
5. Run `pnpm build+zip`. Confirm that the extension manifests and both userscripts use the target version and that the generated `version.txt` and `userscript-version.txt` match `extensionStoreVersion` and `version` respectively. Recheck the top CHANGELOG heading, `git diff --check`, and the complete diff.
6. Stage only the reviewed release files. Commit as `chore: bump version to <target>` and push with `git push origin dev`. Do not use `git add .`.

## 3. Create and merge the release PR

1. Create or reuse the single open `dev` to `master` PR titled `Release v<target>`. Include the new CHANGELOG section in its body.
2. Watch all required checks to completion. If any check fails, stop and report it; do not merge.
3. Present the PR URL, target version, checks, and release-note summary as a progress update without pausing.
4. After all required checks pass, merge automatically using the repository's normal merge-commit strategy. Verify the PR is merged and record its merge commit.

## 4. Publish the tag

1. Synchronize production without writing directly to it:

   ```bash
   git checkout master
   git pull --ff-only origin master
   ```

2. Verify `master` contains the recorded PR merge commit, the target version in every version file, and `## v<target>` as the first CHANGELOG section. Recheck that `v<target>` does not exist locally or remotely.
3. Report the exact tag command and explain that pushing it triggers `.github/workflows/release.yml`, then continue without pausing.
4. After every verification passes, run automatically:

   ```bash
   git tag -a v<target> -m "Release version <target>"
   git push origin v<target>
   ```

5. Find the tag-triggered `release.yml` run, watch it to completion, and verify `gh release view v<target>`. Report failures without retrying destructive or publication steps automatically.

## 5. Synchronize dev and report

After a successful release, run:

```bash
git checkout dev
git pull --ff-only origin dev
git merge --ff-only origin/master
git push origin dev
```

Report the released version, PR URL, merge commit, tag, workflow result, GitHub Release URL, and final branch state. If synchronization fails, leave published history untouched and report the exact recovery point.
