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

For a prerelease (for example, a `1.0.0-next.N`), Changesets uses a prerelease mode: `changeset pre enter next`, then the usual version and publish steps, and `changeset pre exit` when finished. Releases go out under the `next` npm dist-tag instead of `latest`.

The Changesets documentation recommends running prereleases from a branch other than the default one, and warns that mistakes in this mode are hard to undo. Read the current [prerelease guide](https://changesets.dev/guide/prereleases) before starting one. The workflow currently only runs on `main`, so it has to be adapted first.

### Troubleshooting

- **`GitHub Actions is not permitted to create or approve pull requests`:** enable the setting listed in the maintainer setup.
- **The publish job fails with an authentication error:** check that the npm trusted publisher matches the workflow filename and environment exactly.
- **Published versions cannot be overwritten on npm.** If a release is broken, fix it on `main` with a new changeset and release a new patch version. Avoid moving or deleting a pushed tag.
