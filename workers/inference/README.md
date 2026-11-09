# Anysub worker

Processing worker for Anysub. It leases jobs from the Anysub application and runs them through model adapters. It never opens the database.

See [docs/ADAPTERS.md](../../docs/ADAPTERS.md) for the adapter contract and how to build an image with your own adapter.
