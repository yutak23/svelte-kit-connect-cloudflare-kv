import { describe, it, expect, beforeEach } from 'vitest';
import type { SessionCookieOptions } from 'svelte-kit-sessions';
import { Miniflare } from 'miniflare';
import { KVNamespace } from '@cloudflare/workers-types';
import KvStore from '../src/index.js';

const mf: Miniflare = new Miniflare({
	modules: true,
	script: `
  export default {
    async fetch(request, env, ctx) {
      const value = parseInt(await env.TEST_NAMESPACE.get("count")) + 1;
      await env.TEST_NAMESPACE.put("count", value.toString());
      return new Response(value.toString());
    },
  }
  `,
	kvNamespaces: ['TEST_NAMESPACE']
});

declare module 'svelte-kit-sessions' {
	interface SessionData {
		foo?: string;
	}
}

const dumyCookieOptions: SessionCookieOptions = {
	path: '/',
	httpOnly: true,
	secure: true,
	sameSite: 'lax'
};

describe('Test RedisStore', () => {
	describe('client is KVNamespace', async () => {
		const ns = (await mf.getKVNamespace('TEST_NAMESPACE')) as KVNamespace;
		const store = new KvStore({ client: ns });

		beforeEach(async () => {
			const ids = await ns.list();
			await Promise.all(ids.keys.map((key) => ns.delete(key.name)));
		});

		describe('constructor', () => {
			it('ttl less than 60 * 1000ms, then throw error', () => {
				expect(() => {
					// eslint-disable-next-line no-new
					new KvStore({ client: ns, ttl: 1000 });
				}).toThrow(
					'ttl must be at least 60 * 1000. please refer to https://developers.cloudflare.com/workers/runtime-apis/kv#expiration-ttlhttps://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body.'
				);
			});

			it('ttl is 60 * 1000ms, then not throw error', () => {
				expect(() => {
					// eslint-disable-next-line no-new
					new KvStore({ client: ns, ttl: 60 * 1000 });
				}).not.toThrow();
			});
		});

		describe('get', () => {
			it('should be null', async () => {
				const data = await store.get('sessionId');
				expect(data).toBe(null);
			});

			it('should not be null', async () => {
				await store.set('sessionId', { cookie: dumyCookieOptions, data: { foo: 'foo' } }, Infinity);
				const data = await store.get('sessionId');
				expect(data).toEqual({ cookie: dumyCookieOptions, data: { foo: 'foo' } });
			});
		});

		describe('set', () => {
			it('data is empty object', async () => {
				await store.set('sessionId', { cookie: dumyCookieOptions, data: {} }, Infinity);
				const data = await store.get('sessionId');
				expect(data).toEqual({ cookie: dumyCookieOptions, data: {} });
			});

			it('ttl is 60 * 1000ms, then not throw error', async () => {
				await store.set('sessionId', { cookie: dumyCookieOptions, data: {} }, 60 * 1000);
				const data = await store.get('sessionId');
				expect(data).toEqual({ cookie: dumyCookieOptions, data: {} });
			});

			it('ttl is 1000ms, then throw error ', async () => {
				await expect(
					store.set('sessionId', { cookie: dumyCookieOptions, data: {} }, 1000)
				).rejects.toThrow(
					'ttl must be at least 60 * 1000. please refer to https://developers.cloudflare.com/workers/runtime-apis/kv#expiration-ttlhttps://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body.'
				);
			});
		});

		describe('destroy', () => {
			it('should be null', async () => {
				await store.set(
					'sessionId',
					{ cookie: dumyCookieOptions, data: { foo: 'foo' } },
					60 * 1000
				);
				await store.destroy('sessionId');
				const data = await store.get('sessionId');
				expect(data).toBe(null);
			});

			it('should not be error when not exist key', async () => {
				await store.destroy('sessionId');
			});
		});

		describe('touch', () => {
			it('should be updated ttl', async () => {
				await store.set(
					'sessionId',
					{ cookie: dumyCookieOptions, data: { foo: 'foo' } },
					60 * 1000
				);
				await store.touch('sessionId', 60 * 1000);
				await new Promise((resolve) => {
					setTimeout(resolve, 250);
				});
				const data = await store.get('sessionId');
				expect(data).toEqual({ cookie: dumyCookieOptions, data: { foo: 'foo' } });
			});

			it('should not be error when not exist key', async () => {
				await store.touch('sessionId', 60 * 1000);
			});

			it('ttl is 1000ms, then throw error ', async () => {
				await expect(store.touch('sessionId', 1000)).rejects.toThrow(
					'ttl must be at least 60 * 1000. please refer to https://developers.cloudflare.com/workers/runtime-apis/kv#expiration-ttlhttps://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body.'
				);
			});
		});
	});
});
