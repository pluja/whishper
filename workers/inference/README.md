# Anysub worker

The worker leases durable jobs from the Anysub application and dispatches them
to capability-based adapters. It never connects to PostgreSQL.

Custom model support is provided by Python packages that publish an
`anysub.adapters` entry point. Install those packages while building a derived
worker image; nothing is installed on the Docker host.

See `docs/ADAPTERS.md` in the repository root for the adapter contract and a
minimal example.
