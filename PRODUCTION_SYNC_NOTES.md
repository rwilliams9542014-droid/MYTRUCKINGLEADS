Production sync completed on 2026-05-14.

This folder now mirrors the live production frontend that `https://www.mytruckingleads.com/` is serving today:

- Root `*.html` files are the downloaded production pages.
- Root `assets/` contains the production CSS, JavaScript, and image assets those pages reference.
- `public/` is now only for root-level static files such as `robots.txt` and `sitemap.xml`.
- The earlier local React/Tailwind work was preserved in `archive/local-pre-production-sync-2026-05-14/`.

Important:

- I did not deploy anything to Railway while making this sync.
- This folder is linked to the Railway project, but still not linked to a specific service, which helps avoid accidental deploys while we sort out the backend source.
- The live Railway `backend` service also exposes `/api/...` endpoints. Those backend server files were not recoverable from this local repo, so this sync is a production frontend snapshot, not a full backend source recovery.
- `src/` still exists locally as older work, but it is not what the current production homepage is using.

If we want the local project to become a complete deploy-safe clone of the Railway service, the next step is recovering or recreating the backend service source, not just the frontend pages.
