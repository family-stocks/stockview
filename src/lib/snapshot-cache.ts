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
  name: string, revalidate: number, loader: (...args: Args) => Promise<Value>,
) {
  return async (...args: Args): Promise<{data: Value; fetchedAt: string}> => {
    const {base, headers} = recordsConnection();
    const scope = createHash('sha256').update(base).update(headers.Authorization).digest('hex');
    const read = unstable_cache(async (...parameters: Args) => {
      const data = await loader(...parameters);
      return {
        payload: gzipSync(JSON.stringify(data)).toString('base64'),
        fetchedAt: new Date().toISOString(),
      };
    }, ['stockconnect-snapshot', name, scope], {revalidate});
    const snapshot = await read(...args);
    return {
      data: JSON.parse(gunzipSync(Buffer.from(snapshot.payload, 'base64')).toString('utf8')) as Value,
      fetchedAt: snapshot.fetchedAt,
    };
  };
}
