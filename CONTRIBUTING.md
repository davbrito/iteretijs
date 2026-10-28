# Contributing to Iteretijs

:+1::tada: First off, thanks for taking the time to contribute! :tada::+1:

The following is a set of guidelines for contributing to Iteretijs. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

Iteretijs is open to contributions. Feel free to open issues or PRs that contributes to the development of the librery.

## Releasing a new version

Releases are published to npm by the [`Node.js Package`](.github/workflows/npm-publish.yml) workflow, which runs when a tag matching `vX.Y.Z` is pushed. It installs the dependencies, runs the tests, builds the package with `tsdown` and runs `npm publish` using [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so no npm token is stored in the repository.

Only maintainers with push access to `main` can release. The package must have this repository and the `npm-publish.yml` workflow configured as a trusted publisher in its npm settings.

1. **Make sure `main` is ready.** Pull the latest `main` and check that CI is green. Locally, run:

   ```bash
   npm ci
   npm run lint
   npm run format:check
   npm test -- --run
   npm run build
   ```

2. **Choose the version bump** following [Semantic Versioning](https://semver.org). Commits follow [Conventional Commits](https://www.conventionalcommits.org), so the types since the last tag tell you the bump:

   | Changes since the last release                          | Bump    |
   | ------------------------------------------------------- | ------- |
   | `fix:`, `perf:`, or only internal changes               | `patch` |
   | `feat:`                                                 | `minor` |
   | Anything marked `!` or with a `BREAKING CHANGE:` footer | `major` |

   While the version is below `1.0.0`, breaking changes bump `minor` instead.

3. **Bump the version and create the tag** from a clean `main`:

   ```bash
   npm version <patch|minor|major>
   ```

   This updates `package.json` and `package-lock.json`, creates a commit named after the new version and the `vX.Y.Z` tag.

4. **Push the commit and the tag**:

   ```bash
   git push origin main --follow-tags
   ```

   Pushing the tag starts the `Node.js Package` workflow. Follow it in the **Actions** tab; if the tests or the build fail, nothing is published.

5. **Verify the release.** Check that the new version shows up on [npm](https://www.npmjs.com/package/iteretijs), and optionally create a GitHub release from the tag with the notes of the notable changes.

If the workflow fails after the tag was pushed, fix the problem on `main` and bump to a new patch version. Published versions cannot be overwritten on npm, and moving or deleting a pushed tag should be avoided.
