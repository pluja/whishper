# Security policy

## Reporting a vulnerability

Report vulnerabilities privately with GitHub's private vulnerability reporting on this repository: open the Security tab and choose "Report a vulnerability". Do not open a public issue or pull request for a security problem.

Include the affected version or commit, what you can do with the flaw, and steps to reproduce it. Logs help, but remove transcript text, media content, and credentials first.

This is a volunteer-run project, so responses are best effort. Reports get an acknowledgement and, once a fix ships, credit unless you prefer to stay anonymous.

## Supported versions

| Version        | Supported |
| -------------- | --------- |
| 4.x            | Yes       |
| 3.x (Whishper) | No        |

Fixes ship in a new 4.x release, so stay on the latest one. Version 3 is unmaintained, and issues found only there will not be fixed.

## Scope

In scope:

- Authentication, sessions, the first-run owner setup, and password recovery, including their log-printed codes.
- Authorization between workspaces and projects.
- The upload endpoint, media serving, and storage paths, including path traversal and writes outside the data root.
- The internal worker API under `/api/internal` and its token handling.
- Secret handling, including the checks that reject placeholder secrets.
- The Compose files and container images as shipped in this repository.

Out of scope:

- Adapters you install yourself. They run as trusted code inside the worker.
- A deployment that exposes Anysub without TLS, or runs behind a misconfigured reverse proxy.
- Anyone with access to the host, the Docker socket, or the database and data volumes.
- Weaknesses in third-party dependencies with no demonstrable effect on Anysub. Report those upstream.
- Denial of service through resource exhaustion by the signed-in owner, since there is only one account.
- Missing hardening in the single shared worker token. Per-worker credentials are not built yet.

## Deployment notes

- Anysub does not terminate TLS. Put it behind a reverse proxy that does when it is reachable from outside your machine. See [docs/INSTALL.md](docs/INSTALL.md#reverse-proxy).
- Anysub generates its session secret and worker token on first start and keeps them in its database, so every installation has its own. Secrets set through environment variables must be long enough, and Anysub refuses to start with placeholders published in this repository's history.
- Anysub accepts requests on any address it is reached by and blocks cross-site requests with the browser's `Sec-Fetch-Site` and `Origin` headers. It does not pin a hostname, so a DNS-rebinding page can reach the sign-in and setup forms, but not a signed-in session.
- Failed sign-ins are slowed down per client address and per account, up to one minute between attempts. Behind a reverse proxy, forward the client address as described in [docs/CONFIGURATION.md](docs/CONFIGURATION.md#network).
- Anysub sends no telemetry. Network access is needed only to download model files.
