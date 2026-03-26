# openclaw-worker
OpenClaw on Cloudflare Workers

## GitHub Actions deploy

The repository includes `.github/workflows/deploy.yml`, which deploys automatically on pushes to `main` and can also be triggered manually from the Actions tab.

Before using it, add this repository secret in GitHub:

- `CLOUDFLARE_API_TOKEN`: API token with permission to deploy Workers in the target Cloudflare account.
