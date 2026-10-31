import 'server-only';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { unstable_cache } from 'next/cache';
import { recordsConnection } from './records-connection';

/** Next's persistent data cache serves stale data while refreshing in the background.
 * Throwing on a failed refresh preserves the previous successful snapshot.
 * Compress whole snapshots to keep the report list below the cache's item limit.
 * Credentials never appear in the cached value or the public response.
 */
export function cachedSnapshot<Args extends unknown[], Value>(
  name: string, revalidate: number, loader: (...args: Args) => Promise<Value>, freshFirst = false,
) {
  return async (...args: Args): Promise<{data: Value; fetchedAt: string; stale?: boolean}> => {
    const {base, headers} = recordsConnection();
    const scope = createHash('sha256').update(base).update(headers.Authorization).digest('hex');
    let fresh: {data: Value; fetchedAt: string} | undefined;
    if (freshFirst) {
      try { fresh = {data: await loader(...args), fetchedAt: new Date().toISOString()}; }
      catch { /* Fall back to the last successful snapshot. */ }
    }
    const read = unstable_cache(async (...parameters: Args) => {
      const data = fresh ? fresh.data : await loader(...parameters);
      return {
        payload: gzipSync(JSON.stringify(data)).toString('base64'),
        fetchedAt: fresh?.fetchedAt || new Date().toISOString(),
      };
    }, ['stockconnect-snapshot', name, scope], {revalidate});
    if (fresh) {
      try { await read(...args); } catch { /* Cache availability must not discard fresh data. */ }
      return {...fresh, stale: false};
    }
    const snapshot = await read(...args);
    return {
      data: JSON.parse(gunzipSync(Buffer.from(snapshot.payload, 'base64')).toString('utf8')) as Value,
      fetchedAt: snapshot.fetchedAt,
      stale: freshFirst,
    };
  };
}
