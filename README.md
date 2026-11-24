# helpdesk-dashboard-worker

**A live help-desk supervision dashboard served from a Cloudflare Worker.**

- The Worker validates the **Cloudflare Access** JWT (`TEAM_DOMAIN`, `ACCESS_AUD`) on every request and answers 403 otherwise (`run_worker_first`).
- It queries Odoo through its API (`ODOO_API_KEY` is a Wrangler secret), caches results in **Workers KV** and refreshes every 5 minutes.
- Front end: static page with **D3** charts (`page/`, assembled into `public/` by `build/armar.ps1`) and a separate `indicadores` page that exports PDF / Excel.

## Run
```
npm install
npx wrangler secret put ODOO_API_KEY
npx wrangler dev        # or: npx wrangler deploy
```
Fill the placeholders in `wrangler.jsonc` (`account_id`, KV `id`, `ODOO_URL`, `TEAM_DOMAIN`, `ACCESS_AUD`).

## Español
Tablero de supervisión de tickets en un Worker de Cloudflare: autenticación con Cloudflare Access, datos de Odoo en vivo, caché en KV y gráficas con D3.

> **Note / Nota:** sanitized portfolio version of production work built for a corporate IT help desk. Company names, people, hosts, IDs and data were replaced with placeholders; secrets never lived in the code (they sit in the Windows Credential Manager). / Versión anonimizada de un trabajo real de mesa de ayuda corporativa: nombres, hosts, IDs y datos fueron reemplazados; los secretos nunca estuvieron en el código.
