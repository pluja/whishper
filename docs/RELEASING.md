# Releasing

This page is for maintainers. A release is a Git tag. Pushing it runs [release.yml](../.github/workflows/release.yml), which publishes the images to the GitHub Container Registry and drafts a GitHub release for you to review.

## Versions

Anysub uses [Semantic Versioning](https://semver.org). The web application and the worker always share one version, because they speak a protocol that changes with the code.

- A patch release (4.0.1) fixes bugs and changes no behavior people rely on.
- A minor release (4.1.0) adds features. Upgrading needs no manual step beyond the usual backup.
- A major release (5.0.0) needs the people who run Anysub to act, for example a change to the Compose files they keep.

Every release publishes these tags:

| Image                         | Tags                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `ghcr.io/pluja/anysub`        | `4.1.0`, `4.1`, `4`, `latest`                             |
| `ghcr.io/pluja/anysub-worker` | `4.1.0`, `4.1`, `4`, `latest`                             |
| `ghcr.io/pluja/anysub-worker` | `4.1.0-cuda`, `4.1-cuda`, `4-cuda`, `latest-cuda`         |
| `ghcr.io/pluja/anysub-worker` | `4.1.0-remote`, `4.1-remote`, `4-remote`, `latest-remote` |

The Compose files pin the exact version, so an installation changes only when its administrator upgrades it.

A shared tag only moves forward. A release moves `latest` when it is the highest version, its major tag when it is the highest in that major line, and its minor tag when it is the highest in that minor line. A fix for an older line, such as 4.0.2 after 4.1.0, moves only `4.0`, and `latest` and `4` stay on 4.1.0.

## Cutting a release

1. Set the new version in these files. A test fails while any of them disagree.
   - `apps/web/package.json`: `version`.
   - `workers/inference/pyproject.toml`: `version`. Then refresh the lockfile:
     ```sh
     docker compose -f compose.yaml -f compose.dev.yaml -p anysub-dev run --rm --no-deps worker uv lock
     ```
   - `compose.yaml`: both image tags.
   - `compose.cuda.yaml`: the worker tag, with `-cuda`.
   - `compose.remote.yaml`: the worker tag, with `-remote`.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [4.1.0] - YYYY-MM-DD`, or add that section, written for the people who run and use Anysub, and add a link for it at the bottom. The release notes are this section.
3. Run `make verify`.
4. Commit with `chore(release): 4.1.0` and push to `main`. Wait for CI to pass, including the image builds.
5. Tag the commit and push the tag:
   ```sh
   git tag -a v4.1.0 -m "Anysub 4.1.0"
   git push origin v4.1.0
   ```
6. Watch the Release workflow. It runs the checks again and confirms the tag matches the version. It then pushes each image under its exact version, moves the shared tags this release is the newest for once all four images exist, and drafts the release with `compose.yaml`, `compose.cuda.yaml` and `compose.remote.yaml` attached.
7. Read the draft on the Releases page, then publish it. Check **Set as the latest release** only when this is the highest version: the install guide downloads `releases/latest/download/compose.yaml`, so the latest release must be the newest version.

If an image fails, `latest` and the other shared tags stay on the previous release. For a transient failure, such as a registry timeout, choose **Re-run failed jobs**. If the build itself is broken, fix it and release the next patch version. Never move a tag that published images.

## Release candidates

To try the workflow or a risky change first, release a candidate: use a version such as `4.1.0-rc.1` in every file and in the changelog heading, and tag `v4.1.0-rc.1`. A pre-release publishes only its own tags, such as `4.1.0-rc.1` and `4.1.0-rc.1-cuda`, never moves `latest`, and its draft is marked as a pre-release. Set the final version before tagging the real release.

## Repository settings

- Protect release tags with a tag ruleset on `refs/tags/v*` that lets only maintainers create, update or delete them. A pushed tag publishes images.
- New packages on the GitHub Container Registry are private. After the first release workflow, open `anysub` and `anysub-worker` from the profile's **Packages** tab and change the visibility to public under **Package settings**. Pulls fail for everyone else until you do, and a public package cannot be made private again.
- If a package of the same name existed before, the workflow cannot push to it until the repository has write access under the package's **Manage Actions access**.
