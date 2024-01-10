import type { SessionStoreData, Store } from 'svelte-kit-sessions';
import type { KVNamespace } from '@cloudflare/workers-types';

interface Serializer {
	parse(s: string): SessionStoreData | Promise<SessionStoreData>;
	stringify(data: SessionStoreData): string;
}

interface KvStoreOptions {
	/**
	 * An KVNamespace.
	 */
	client: KVNamespace;
	/**
	 * The prefix of the key in redis.
	 * @default 'sess:'
	 */
	prefix?: string;
	/**
	 * The serializer to use.
	 * @default JSON
	 */
	serializer?: Serializer;
	/**
	 * Time to live in milliseconds.
	 * This ttl to be used if ttl is _Infinity_ when used from `svelte-kit-sessions`
	 * @default 86400 * 1000
	 */
	ttl?: number;
}

const ONE_DAY_IN_SECONDS = 86400;

export default class KvStore implements Store {
	constructor(options: KvStoreOptions) {
		// The number of seconds for which the key should be visible before it expires. At least 60.
		// (https://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body)
		if (options.ttl && options.ttl < 60 * 1000)
			throw new Error(
				'ttl must be at least 60 * 1000. please refer to https://developers.cloudflare.com/workers/runtime-apis/kv#expiration-ttlhttps://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body.'
			);

		this.client = options.client;
		this.prefix = options.prefix || 'sess:';
		this.serializer = options.serializer || JSON;
		this.ttl = options.ttl || ONE_DAY_IN_SECONDS * 1000;
	}

	/**
	 * An KVNamespace.
	 */
	client: KVNamespace;

	/**
	 * The prefix of the key in redis.
	 * @default 'sess:'
	 */
	prefix: string;

	/**
	 * The serializer to use.
	 * @default JSON
	 */
	serializer: Serializer;

	/**
	 * Time to live in milliseconds.
	 * default: 86400 * 1000
	 */
	ttl: number;

	async get(id: string): Promise<SessionStoreData | null> {
		const key = this.prefix + id;
		const storeData = await this.client.get(key, { type: 'text' });
		return storeData ? this.serializer.parse(storeData) : null;
	}

	async set(id: string, storeData: SessionStoreData, ttl: number): Promise<void> {
		if (ttl < 60 * 1000)
			throw new Error(
				'ttl must be at least 60 * 1000. please refer to https://developers.cloudflare.com/workers/runtime-apis/kv#expiration-ttlhttps://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body.'
			);

		const key = this.prefix + id;
		const serialized = this.serializer.stringify(storeData);

		// Infinite time does not support, so it is implemented separately.
		if (ttl !== Infinity) {
			// https://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body
			await this.client.put(key, serialized, { expirationTtl: ttl / 1000 });
			return;
		}
		await this.client.put(key, serialized, { expirationTtl: this.ttl / 1000 });
	}

	async destroy(id: string): Promise<void> {
		const key = this.prefix + id;
		await this.client.delete(key);
	}

	async touch(id: string, ttl: number): Promise<void> {
		if (ttl < 60 * 1000)
			throw new Error(
				'ttl must be at least 60 * 1000. please refer to https://developers.cloudflare.com/workers/runtime-apis/kv#expiration-ttlhttps://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body.'
			);

		const storeData = await this.get(id);
		if (storeData) {
			const key = this.prefix + id;
			const serialized = this.serializer.stringify(storeData);
			await this.client.put(key, serialized, { expirationTtl: ttl / 1000 });
		}
	}
}
