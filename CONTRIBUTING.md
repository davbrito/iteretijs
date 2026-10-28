# Contributing to Iteretijs

:+1::tada: First off, thanks for taking the time to contribute! :tada::+1:

The following is a set of guidelines for contributing to Iteretijs. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

Iteretijs is open to contributions. Feel free to open issues or PRs that contributes to the development of the librery.

## Adding a changeset

Releases are driven by [Changesets](https://changesets.dev). Each change that users should know about carries a small Markdown file in `.changeset/`, written in the same PR as the code. Commit messages do not drive releases, but we keep using [Conventional Commits](https://www.conventionalcommits.org) for readable history.

**When.** Add a changeset to any PR that changes published behavior: `src/**`, or the `exports` or `engines` in `package.json`. You don't need one for tests, CI, docs or tooling. The changeset bot comments on every PR to tell you whether it has one.

**How.** Run `npm run changeset`, pick the bump, write the summary and commit the generated file. You can add several changesets to a PR (one per user-visible change) and edit, rename or delete them until they are released. A maintainer can also add one from the link in the bot's comment.

**Choosing the bump.** While the version is below `1.0.0`:

| Change                                               | Bump    |
| ---------------------------------------------------- | ------- |
| Breaking change (removed or changed API, new engine) | `minor` |
| New feature, deprecation, fix or performance work    | `patch` |

From `1.0.0` on, standard [Semantic Versioning](https://semver.org) applies (breaking changes are `major`).

**What to write.** The summary goes verbatim into `CHANGELOG.md` and the GitHub Release, so write it for users, in Markdown. Say **what** changed, **why**, and **how** to update their code. Code samples are welcome, especially for migrations. For example, for a deprecation:

````md
---
"iteretijs": patch
---

Deprecate `zip` in favor of the native `Iterator.zip`.

`zip` will be removed in v1.0. The native version takes an iterable of iterables:

```diff
- zip(a, b)
+ Iterator.zip([a, b])
```
````

## Releasing a new version

Releases are automated by the [`Release`](.github/workflows/release.yml) workflow, which runs on every push to `main`. Nobody publishes from a laptop and nobody pushes tags by hand.

1. **Merge PRs with changesets into `main`.** The workflow opens (or updates) a PR named `chore: version packages` that bumps `package.json` and `package-lock.json` and writes the new `CHANGELOG.md` entries. That PR is the release review: check the version and the notes.
2. **Merge the `chore: version packages` PR.** The workflow then builds, packs and publishes the package to npm using [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no stored token), creates the `vX.Y.Z` tag and the GitHub Release with the changelog entry as its notes.
3. **Verify the release.** Check the new version on [npm](https://www.npmjs.com/package/iteretijs) and the [GitHub Releases](https://github.com/davbrito/iteretijs/releases) page.

PRs opened by `GITHUB_TOKEN` don't trigger other workflows, so CI does not run automatically on the version PR. The code it releases already passed CI on `main`; if you want CI on it anyway, run the **CI** workflow manually on the `changeset-release/main` branch from the **Actions** tab.

### Maintainer setup

The workflow depends on settings outside this repository:

- **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** must be enabled.
- A GitHub environment named `npm` must exist. Optionally add required reviewers to it for a manual approval before each publish.
- The npm package must list this repository, the `release.yml` workflow and the `npm` environment as its trusted publisher.

### Prereleases

Prereleases (for example `1.0.0-next.0`) let users try breaking changes before a stable release. Changesets has a prerelease mode for this. It is easy to get wrong, so read the [prerelease guide](https://changesets.dev/guide/prereleases) first. Mistakes can leave the repository and npm in a state that is hard to fix.

In this repository, prereleases are made from a long-lived **`next` branch**, never from `main`. `main` keeps releasing stable `0.x` versions (fixes, deprecations) in the meantime. Versions are published under the `next` npm dist-tag, so `latest` does not move, and users install them with `npm install iteretijs@next`.

How it is wired:

- `release.yml` runs on pushes to `main` and `next`, and `ci.yml` also runs on pushes to `next`.
- Outside `main`, the `pack` job refuses to publish unless `.changeset/pre.json` exists and has `"mode": "pre"` (`pre exit` switches it to `"exit"`). Pushing to `next` can never publish a stable version to `latest`.
- The Version Packages PR targets the branch the workflow ran on, so on `next` it is titled and based on `next`.
- The `main` ruleset only protects the default branch. If you want `next` protected too, add it to the ruleset's targets.

**Starting a prerelease cycle**

1. Release everything pending on `main` first, so old changesets are not pulled into the first prerelease.
2. Create the branch: `git switch -c next main && git push -u origin next`.
3. On `next`, set `"baseBranch": "next"` in `.changeset/config.json`.
4. Run `npx changeset pre enter next`. This creates `.changeset/pre.json`. Commit and push it (through a PR into `next`, or directly if you did not protect it).
5. Merge breaking-change PRs into `next`, each with its own changeset, like on `main`.

**Releasing a prerelease**

Merge the Version Packages PR on `next`. It publishes `X.Y.Z-next.N` under the `next` dist-tag, creates the tag and the GitHub Release. Repeat as often as needed. While in prerelease mode, consumed changesets move to `.changeset/pre` instead of being deleted; they feed the stable changelog, and you can still edit or delete them before exiting.

Keep `next` current by merging `main` into it regularly, so fixes released on `main` are not lost.

**Exiting: the stable release**

1. On `next`, restore `"baseBranch": "main"` and run `npx changeset pre exit`. This only records the intent in `pre.json`; it versions nothing.
2. Commit, and merge `next` into `main` through a PR.
3. On `main`, the workflow opens the Version Packages PR with the stable version (for example `1.0.0`). Merging it publishes to `latest`.
4. Delete the `next` branch, or keep it for the following cycle.

**Caveats**

- Prerelease mode applies to the whole package; you cannot exclude changes.
- Prerelease versions are not satisfied by most semver ranges, so a user on `^0.3.0` will not get `1.0.0-next.0` by accident.
- A package that was never published also gets the `latest` tag in prerelease mode. This does not apply here, because `iteretijs` already has stable versions.
- `pre enter` and `pre exit` should only be committed on `next`. Never merge a `pre.json` into `main` while the cycle is running.
- To share a build of one PR without a prerelease cycle, a snapshot (`changeset version --snapshot`) is a lighter alternative. It is not wired into the workflow yet.

### Troubleshooting

- **`GitHub Actions is not permitted to create or approve pull requests`:** enable the setting listed in the maintainer setup.
- **The publish job fails with an authentication error:** check that the npm trusted publisher matches the workflow filename and environment exactly.
- **Published versions cannot be overwritten on npm.** If a release is broken, fix it on `main` with a new changeset and release a new patch version. Avoid moving or deleting a pushed tag.
