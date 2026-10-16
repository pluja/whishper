# Security policy

## Reporting a vulnerability

Report vulnerabilities privately with GitHub's private vulnerability reporting on this repository: open the Security tab and choose "Report a vulnerability". Do not open a public issue or pull request for a security problem.

Include the affected version or commit, what you can do with the flaw, and steps to reproduce it. Logs help, but remove transcript text, media content, and credentials first.

This is a volunteer-run project, so responses are best effort. Reports get an acknowledgement and, once a fix ships, credit unless you prefer to stay anonymous.

## Supported versions

| Version        | Supported |
| -------------- | --------- |
| 4.x (beta)     | Yes       |
| 3.x (Whishper) | No        |

Only the `v4` branch and its latest commit receive fixes. Version 3 is unmaintained, and issues found only there will not be fixed.

## Scope

In scope:

- Authentication, sessions, and the first-run owner setup.
- Authorization between workspaces and projects.
- The upload endpoint, media serving, and storage paths, including path traversal and writes outside the data root.
- The internal worker API under `/api/internal` and its token handling.
- Secret handling, including the checks that reject placeholder secrets.
- The Compose files and container images as shipped in this repository.

Out of scope:

- Adapters you install yourself. They run as trusted code inside the worker.
- A deployment that exposes Anysub without TLS, or runs behind a misconfigured reverse proxy.
- Anyone with access to the host, the Docker socket, the `.env` file, or the database volumes.
- Weaknesses in third-party dependencies with no demonstrable effect on Anysub. Report those upstream.
- Denial of service through resource exhaustion by the signed-in owner, since there is only one account.
- Missing hardening in the single shared worker token. Per-worker credentials are not built yet.

## Deployment notes

- Anysub does not terminate TLS. Put it behind a reverse proxy that does when it is reachable from outside your machine. See [docs/INSTALL.md](docs/INSTALL.md#reverse-proxy).
- Run `scripts/init-env.sh` so `BETTER_AUTH_SECRET`, `ANYSUB_WORKER_TOKEN`, and the database password are unique. Anysub refuses to start with the published placeholders.
- Anysub sends no telemetry. Network access is needed only to download model files.
