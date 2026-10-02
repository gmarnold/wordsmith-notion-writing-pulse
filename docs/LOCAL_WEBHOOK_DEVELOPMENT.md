# Local webhook development

This workflow requires the development computer, local PostgreSQL/API and a temporary Cloudflare tunnel to remain running. It is for development and diagnostics only.

Use the detailed [local webhook setup guide](WEBHOOK_SETUP.md) and either [native PostgreSQL](POSTGRESQL_SETUP.md) or the existing Docker Compose database. Tunnel only the public listener on port 4142; configuration remains on loopback port 4141 with the Vite app on its configured local port.

For normal writing with the computer off, use [production deployment](PRODUCTION_DEPLOYMENT.md). No Cloudflare tunnel is used in that architecture. Keep local secrets in the ignored `apps/api/.env`; never replace them with hosted database credentials merely to configure production.
