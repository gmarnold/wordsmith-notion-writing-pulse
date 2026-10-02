# Native PostgreSQL on Windows

Docker is optional for Wordsmith. The API connects to PostgreSQL using DATABASE_URL regardless of whether the server is a Windows service, container or hosted database.

PostgreSQL 18 was detected running as the postgresql-x64-18 Windows service on port 5432. The earlier Docker-style Wordsmith credentials were rejected by this native installation with authentication code 28P01. The Docker container credentials do not automatically create an account in the Windows installation.

## Current setup

Native PostgreSQL 18 is now configured for this workspace. The wordsmith database and a dedicated wordsmith login were created, the application login is not a superuser, and both migrations were applied. DATABASE_URL already contains the generated application credentials in the ignored local apps/api/.env file. Keep that connection; do not replace it with the administrator connection again. Restart the API to load the new credentials. The fresh native database currently has no tracked manuscripts, so inspect and sync the Scenes database to establish tracking baselines.

## Provision a new installation

1. Keep the PostgreSQL Windows service running. There is no need to start Docker Desktop or run docker compose.
2. To let Codex configure a dedicated Wordsmith database/account, temporarily set DATABASE_URL in apps/api/.env to the native installer administrator connection:

   ```dotenv
   DATABASE_URL=postgresql://postgres:YOUR_INSTALLER_PASSWORD@localhost:5432/postgres
   ```

   Put the actual password only in this ignored local file. Never paste it into chat. URL-encode special characters in the password portion (for example, @ becomes %40 and # becomes %23). Reply Ready without sharing the URL or password. This temporary connection is for database provisioning, not the final application configuration.

3. Codex will verify authentication, inspect whether a Wordsmith database already exists, configure an application account/database without discarding existing writing history, replace DATABASE_URL locally with the application connection, and run npm run db:migrate.
4. Restart the API with npm run dev:api after its environment is finalized. The existing web app and public listener ports remain unchanged. Continue the Notion verification steps in [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md).

If configuring manually through pgAdmin instead, create an application login and a database owned by that login, set DATABASE_URL to that database/account, then run npm run db:migrate. PostgreSQL must remain running for webhook history and configuration to persist.

An ECONNREFUSED error means the server cannot be reached. A 28P01 error means authentication failed. A missing-table error (42P01) means the database is reachable but migrations may be missing. Do not send database passwords or full connection strings when reporting errors.

Official installer: [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/).
