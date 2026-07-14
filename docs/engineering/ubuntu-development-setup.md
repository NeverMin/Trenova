# Ubuntu Development Environment Setup

This guide follows the repository Taskfiles and the CI workflows so that local development on Ubuntu matches the versions and checks used in automation.

## Versions To Match CI

- Go: `1.26.x` from `.github/workflows/test-tms.yml`
- Node.js: `24.x` from `.github/workflows/test-client.yml`
- pnpm: `10.x` from `.github/workflows/test-client.yml`
- Docker Engine + Docker Compose v2
- Task: latest `go-task/task`

## System Packages

Install the base packages used for local development:

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  ca-certificates \
  curl \
  git \
  unzip \
  docker.io \
  docker-compose-plugin \
  postgresql-client \
  redis-tools
```

Allow your user to run Docker without `sudo`, then refresh your shell session:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker version
docker compose version
```

## Install Go 1.26

Install the same major Go version used in CI:

```bash
curl -LO https://go.dev/dl/go1.26.0.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.26.0.linux-amd64.tar.gz
echo 'export PATH=/usr/local/go/bin:$HOME/go/bin:$HOME/.local/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
go version
```

If you are on ARM64, replace `linux-amd64` with `linux-arm64`.

## Install Node.js 24 And pnpm 10

Use `nvm` so the local version stays aligned with CI more easily:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 24
nvm use 24
corepack enable
corepack prepare pnpm@10 --activate
node -v
pnpm -v
```

## Install Task

The repository uses Taskfile heavily. Install `task` into `~/.local/bin`:

```bash
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin
task --version
```

## Clone And Install Dependencies

From the repository root:

```bash
git clone <your-trenova-repo-url>
cd <repo-directory>
```

Create the local backend config before database setup. The CLI defaults to `services/tms/config/config.yaml`, and `db setup` fails validation if that file does not exist yet.

```bash
cd services/tms
cp config/config.example.yaml config/config.yaml
cd ../..
```

If you are using the updated `services/tms/Taskfile.yml`, `task quick-start` and `task dev` will create `config/config.yaml` automatically when it is missing.
They also fail early if the existing file still contains known legacy keys from an older schema.

Install frontend dependencies before starting the dev servers. This is required because `services/tms/Taskfile.yml` includes `ui-install`, but `quick-start` does not call it.

```bash
cd client
pnpm install --frozen-lockfile
cd ..
```

Then initialize backend dependencies, local tools, Docker services, and the database:

```bash
cd services/tms
task quick-start
```

What `task quick-start` does according to `services/tms/Taskfile.yml`:

- `deps`: downloads Go modules
- `tools`: installs `golangci-lint`, `gosec`, `air`, and `nancy`
- `docker-up`: waits for core local infrastructure and starts Redis Insight as a non-blocking auxiliary UI
- `db-setup`: builds the CLI and runs database setup

## Start The Development Environment

The shortest path is:

```bash
cd services/tms
task dev
```

`task dev` starts:

- backend hot reload via `air api run`
- frontend Vite dev server via `pnpm dev`

If `air` is installed but not on `PATH`, the updated TMS Taskfile will try `$(go env GOPATH)/bin/air` automatically. If `air` is unavailable entirely, it falls back to the compiled API server without hot reload so local development can still start.

Default local endpoints from `services/tms/Taskfile.yml`:

- API: `http://localhost:8080`
- UI: `http://localhost:5173`

If you need the worker as well, start it in a separate terminal:

```bash
cd services/tms
task run-worker
```

If you prefer explicit terminals instead of `task dev`, use:

Terminal 1:

```bash
cd services/tms
task run-watch
```

Terminal 2:

```bash
cd client
pnpm dev
```

Terminal 3 when background jobs are needed:

```bash
cd services/tms
task run-worker
```

## Verify The Environment

Check infrastructure health:

```bash
cd services/tms
task docker-ps
task db-status
```

Run the same core checks that CI enforces.

Backend checks:

```bash
cd services/tms
task lint
task test
task test-integration
go vet ./...
go build -v ./...
```

Frontend checks:

```bash
cd client
pnpm graphql:codegen:check
pnpm test
pnpm build
pnpm lint
```

These commands mirror the current CI behavior:

- `.github/workflows/test-tms.yml`: unit tests, integration tests, race tests, `golangci-lint`, `go vet`, `go build`
- `.github/workflows/test-client.yml`: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm graphql:codegen:check`

## Common Recovery Commands

Restart local infrastructure:

```bash
cd services/tms
task docker-restart
```

Recreate database state:

```bash
cd services/tms
task db-reset
```

Flush Redis cache:

```bash
cd services/tms
task redis-flush
```

Stop all local containers:

```bash
cd services/tms
task docker-down
```

## Troubleshooting

### `db setup` fails with configuration validation errors

If you see errors like `app.name is required` or `database.host is required`, the CLI is usually reading a missing or empty `config/config.yaml`.

Fix it with:

```bash
cd services/tms
cp config/config.example.yaml config/config.yaml
task quick-start
```

If `config/config.yaml` already exists, inspect it and compare it with `config/config.example.yaml`.

If you see errors like these instead:

- `'server' has invalid keys: maxage`
- `'config.Config' has invalid keys: samsara`

then your local `config/config.yaml` was created from an older example file and is now schema-incompatible.

Refresh it with:

```bash
cd services/tms
cp config/config.example.yaml config/config.yaml
```

Then reapply any machine-specific overrides you need, such as database hostnames, secrets, or storage credentials, before rerunning `task quick-start`.

### `db` container is unhealthy

This is separate from the config validation error. `task dev` depends on `task docker-up`, so the stack cannot start until PostgreSQL becomes healthy.

`redis-insight` is an auxiliary UI and is not required for API or frontend startup. The local tasks wait for core services only and start Redis Insight separately so a slow UI health check does not block development.

Check the database container first:

```bash
docker compose -f docker-compose-local.yml ps
docker compose -f docker-compose-local.yml logs --tail=100 db
```

The most common local causes are:

- an old or corrupted PostgreSQL data volume from a previous run or a different PostgreSQL major version
- another local PostgreSQL process already using port `5432`
- a failed first initialization of the `db` container
- PostgreSQL 18 image layout changes when `PGDATA` is not pinned explicitly

This repository now pins `PGDATA=/var/lib/postgresql/data` in `docker-compose-local.yml` so PostgreSQL 18-based local containers continue to work with the existing setup.

If your checkout still shows logs like these:

- `Counter to that, there appears to be PostgreSQL data in: /var/lib/postgresql/data (unused mount/volume)`
- `Error: in 18+, these Docker images are configured to store database data in a format which is compatible with pg_ctlcluster`

update your branch to a revision that includes the `PGDATA` fix, then recreate the local database volume:

```bash
git pull
docker compose -f docker-compose-local.yml down -v
docker compose -f docker-compose-local.yml up -d db
docker compose -f docker-compose-local.yml logs --tail=100 db
```

Safe recovery steps for a disposable local setup:

```bash
docker compose -f docker-compose-local.yml down -v
docker ps -a
ss -ltnp | grep 5432 || true
docker compose -f docker-compose-local.yml up -d db
docker compose -f docker-compose-local.yml logs --tail=100 db
```

### `task tms:dev` fails with `watch: exit status 127`

This usually means the backend watch command could not find `air`, so the API server never started and frontend requests to port `8080` will fail.

Check the tool first:

```bash
command -v air || echo "air is not on PATH"
test -x "$(go env GOPATH)/bin/air" && echo "air exists in GOPATH bin"
```

Install or reinstall the tools if needed:

```bash
cd services/tms
task tools
```

The updated Taskfile now falls back to `$(go env GOPATH)/bin/air` and finally to the compiled CLI server if `air` is unavailable, so `task tms:dev` should still bring up the backend even when hot reload is not available.

If port `5432` is already occupied by a host PostgreSQL service, stop that service before retrying Docker startup.

After PostgreSQL is healthy, rerun:

```bash
cd services/tms
task quick-start
```

## Notes

- Integration tests in CI run with PostgreSQL and Redis available on localhost. Running `task docker-up` locally gives you the equivalent baseline.
- Storybook and Playwright browser setup exist in client CI, but they are not required for the basic app startup path.
- If you work on OCR flows, also install `tesseract` as documented in `services/tms/docs/ocr-setup-linux.md`.