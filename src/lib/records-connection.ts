import 'server-only';

export function recordsConnection() {
  const direct = process.env.STOCKCONNECT_RECORDS_URL?.replace(/\/$/, '');
  const research = process.env.RESEARCH_API_URL?.replace(/\/run\/?$/, '').replace(/\/$/, '');
  const base = direct || (research ? `${research}/stockconnect` : undefined);
  const key = direct ? process.env.STOCKCONNECT_RECORDS_API_KEY : process.env.RESEARCH_API_KEY;
  if (!base || !key) throw new Error('StockConnect connection is not configured.');
  return {base, headers: {Authorization: `Bearer ${key}`, 'ngrok-skip-browser-warning': '1'}};
}
