Host migration backup created on 2026-05-14.

This backup is intended to give you a local, migration-ready copy of the code and configuration behind the live Railway setup for `mytruckingleads.com`.

Included:

- `backend/`
  The Express/Node backend source recovered from `C:\Users\RONNY W\Desktop\MY WEBSITE\backend`.
  Its `public/` folder was overlaid with the current live-matching frontend snapshot from this project so the static pages line up with production as closely as possible.

- `apex-redirect/`
  The separate Railway service that handles the apex-domain redirect from `mytruckingleads.com` to the canonical `www` host.

- `docs/`
  Deployment, setup, integration, and launch notes copied from the existing local project docs.

- `manifests/railway-services.json`
  A non-secret snapshot of the Railway services that are part of the live deployment.

- `secrets/`
  Private environment-variable backups for the backend, apex redirect, Postgres, and MongoDB Railway services.
  These files are intentionally ignored by this project's `.gitignore`.

- `db-backups/postgres/`
  A live Postgres export captured from Railway using the public proxy connection.
  `manifest.json` lists the exported tables and row counts.

Important notes:

- MongoDB export was not completed. The Railway MongoDB proxy connection reset during backup, and Railway currently reports the Mongo service as offline.
- This folder is for recovery and migration, not for active development. The working project root still contains the verified frontend snapshot and migration notes.
- If you move hosting, you will still need to:
  1. Import the Postgres backup into the new database.
  2. Recreate environment variables from the private `secrets/` backups.
  3. Point DNS to the new host and reissue SSL there.
  4. Confirm whether MongoDB is still required for the features you want to keep live.
