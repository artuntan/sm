# Current Runtime Baseline

This document captures the current SM production runtime as it exists before the staged platform rebuild.

## Current Topology

```text
User -> CloudFront -> single ARM EC2 instance -> Next.js standalone app -> shared PostgreSQL (RDS)
```

## Current Deployment Contract

- Deployments are script-driven via `deploy.sh` and `redeploy.sh`.
- Docker images are pushed to ECR.
- EC2 is updated via SSM Run Command.
- Secrets are injected from SSM Parameter Store.
- The app currently expects these production environment variables:
  - `DATABASE_URL`
  - `DATABASE_CA_CERT` (recommended SSM format: single-line PEM with `\n` escapes)
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `BOOTSTRAP_ADMIN_EMAIL`
  - `META_ACCESS_TOKEN`
  - `META_IG_USER_ID`
  - `META_GRAPH_API_VERSION`
  - `APIFY_API_TOKEN`
  - `YOUTUBE_API_KEY`

## Security Baseline

- Database TLS verification is required for RDS connections.
- The deployment scripts must not disable global Node TLS validation.
- The CA certificate used for RDS verification is expected via `DATABASE_CA_CERT`.

## Known Operational Risks

- Single-instance web runtime
- No worker tier yet
- No high-availability deployment strategy
- Shared PostgreSQL instance
- No queue-backed durable execution yet
- No dedicated health-based rollout path yet
- CloudFront still talks to origin over HTTP in the current stack

## Why This Document Exists

The staged rebuild needs one explicit source of truth for the current runtime so future changes are intentional. This document should be updated whenever the deployment contract changes.
