# Tailscale Funnel records access

Hosted Vercel reads now default to `https://stockconnect-mac.tail446f24.ts.net/stockconnect`
when there is no explicit direct records endpoint or the old endpoint uses ngrok.
The existing `RESEARCH_API_KEY` remains server-only and authenticates read-only gateway
requests. Set `STOCKCONNECT_PUBLIC_GATEWAY_URL` to override the Funnel endpoint.
Linux workflow submission remains separately configured through `RESEARCH_API_URL`.

Reports fetch fresh data on every page load/reload. Successful reads prime the existing
compressed snapshot cache; only failed reads return that saved snapshot, labelled as
a connection failure with its fetch time. An already-open report list still needs a
reload. Chart and trigger-result cache intervals remain unchanged.

Checks: `node scripts/cache-regression.mjs`, `node scripts/records-connection-regression.mjs`,
TypeScript compilation, production Docker build and authenticated public list/detail reads.
