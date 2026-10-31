import 'server-only';

export function recordsConnection() {
  const direct = process.env.STOCKCONNECT_RECORDS_URL?.replace(/\/$/, '');
  const research = process.env.RESEARCH_API_URL?.replace(/\/run\/?$/, '').replace(/\/$/, '');
  // Hosted reports have their own endpoint, independent of Linux job submission.
  // Existing Vercel deployments keep their read credential during the ngrok migration.
  const publicGateway = process.env.STOCKCONNECT_PUBLIC_GATEWAY_URL?.replace(/\/$/, '')
    || 'https://stockconnect-mac.tail446f24.ts.net/stockconnect';
  const migrated = process.env.VERCEL === '1' && (!direct || /\.ngrok[-.]/.test(direct));
  const base = migrated ? publicGateway : direct || (research ? `${research}/stockconnect` : undefined);
  const key = migrated ? process.env.RESEARCH_API_KEY
    : direct ? process.env.STOCKCONNECT_RECORDS_API_KEY : process.env.RESEARCH_API_KEY;
  if (!base || !key) throw new Error('StockConnect connection is not configured.');
  return {base, headers: {Authorization: `Bearer ${key}`, 'ngrok-skip-browser-warning': '1'}};
}
