# Anysub worker

The worker leases durable jobs from the Anysub application and dispatches them
to capability-based adapters. It never connects to PostgreSQL.

The default production image installs WhisperX 3.8.6 with CPU PyTorch. It
supports `tiny`, `base`, `small`, `medium`, `large-v3`, and
`large-v3-turbo`; accurate forced alignment is enabled by default. Heavy
model work runs off the async I/O loop while a generic worker heartbeat renews
the durable lease.

Custom model support is provided by Python packages that publish an
`anysub.adapters` entry point. Install those packages while building a derived
worker image; nothing is installed on the Docker host.

See `docs/ADAPTERS.md` in the repository root for the adapter contract and a
minimal example.
