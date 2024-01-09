# svelte-kit-connect-cloudflare-kv

[![npm](https://img.shields.io/npm/v/svelte-kit-connect-cloudflare-kv.svg)](https://www.npmjs.com/package/svelte-kit-connect-cloudflare-kv)
[![test](https://github.com/yutak23/svelte-kit-connect-cloudflare-kv/actions/workflows/test.yaml/badge.svg)](https://github.com/yutak23/svelte-kit-connect-cloudflare-kv/actions/workflows/test.yaml)
![style](https://img.shields.io/badge/code%20style-airbnb-ff5a5f.svg)

**svelte-kit-connect-cloudflare-kv** provides [Cloudflare Workers KV](https://developers.cloudflare.com/kv/) session storage for [svelte-kit-sessions](https://www.npmjs.com/package/svelte-kit-sessions).

## Installation

**svelte-kit-connect-cloudflare-kv** requires [`svelte-kit-sessions`](https://www.npmjs.com/package/svelte-kit-sessions) to installed.

```console
$ npm install @upstash/redis svelte-kit-connect-cloudflare-kv svelte-kit-sessions

$ yarn add @upstash/redis svelte-kit-connect-cloudflare-kv svelte-kit-sessions

$ pnpm add @upstash/redis svelte-kit-connect-cloudflare-kv svelte-kit-sessions
```

## Usage

`svelte-kit-connect-cloudflare-kv` can be used as a custom store for `svelte-kit-sessions` as follows.

**Note** For more information about `svelte-kit-sessions`, see https://www.npmjs.com/package/svelte-kit-sessions.

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { sveltekitSessionHandle } from 'svelte-kit-sessions';
import KvStore from 'svelte-kit-connect-cloudflare-kv';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionHandle = sveltekitSessionHandle({
		secret: 'secret',
		// https://kit.svelte.dev/docs/adapter-cloudflare#bindings
		store: new KvStore({ client: event.platform?.env?.YOUR_KV_NAMESPACE })
	});
	return sessionHandle({ event, resolve });
};
```

**Warning** Use an optional chain for implementation (`event.platform?.env?.YOUR_KV_NAMESPACE`). When [prerendering](https://kit.svelte.dev/docs/page-options#prerender) is done at build time, `event.platform` is undefined because it is before [bindings](https://kit.svelte.dev/docs/adapter-cloudflare#bindings) in Cloudflare, resulting in the following error.

```console
> Using @sveltejs/adapter-cloudflare
TypeError: Cannot read properties of undefined (reading 'env')
```

<details>

<summary>If you want to use it with your own handle, you can use sequence</summary>

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { sveltekitSessionHandle } from 'svelte-kit-sessions';
import KvStore from 'svelte-kit-connect-cloudflare-kv';

const yourOwnHandle: Handle = async ({ event, resolve }) => {
	// `event.locals.session` is available
	// your code here
	const result = await resolve(event);
	return result;
};

const handleForSession: Handle = async ({ event, resolve }) => {
	const sessionHandle = sveltekitSessionHandle({
		secret: 'secret',
		// https://kit.svelte.dev/docs/adapter-cloudflare#bindings
		store: new KvStore({ client: event.platform?.env?.YOUR_KV_NAMESPACE })
	});
	return sessionHandle({ event, resolve });
};

export const handle: Handle = sequence(handleForSession, yourOwnHandle);
```

</details>

## API

```ts
import KvStore from 'svelte-kit-connect-cloudflare-kv';

new KvStore(options);
```

### new KvStore(options)

Create a Redis store for `svelte-kit-sessions`.

### Options

A summary of the `options` is as follows.

| Name       | Type        | required/optional | Description                                                                                                                               |
| ---------- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| client     | KVNamespace | _required_        | An KVNamespace                                                                                                                            |
| prefix     | string      | _optional_        | Key prefix in Redis (default: `sess:`).                                                                                                   |
| serializer | Serializer  | _optional_        | Provide a custom encoder/decoder to use when storing and retrieving session data from Redis (default: `JSON.parse` and `JSON.stringify`). |
| ttl        | number      | _optional_        | ttl to be used if ttl is _Infinity_ when used from `svelte-kit-sessions`                                                                  |

#### client

An KVNamespace.

#### prefix

Key prefix in Redis (default: `sess:`).

#### serializer

Provide a custom encoder/decoder to use when storing and retrieving session data from Redis (default: `JSON.parse` and `JSON.stringify`).

**Note** When setting up a custom serializer, the following interface must be satisfied.

```ts
interface Serializer {
	parse(s: string): SessionStoreData | Promise<SessionStoreData>;
	stringify(data: SessionStoreData): string;
}
```

#### ttl

When `svelte-kit-sessions` calls a method of the store (the `set` function), ttl(milliseconds) is passed to it. However, if the cookie options `expires` and `maxAge` are not set, the ttl passed will be _Infinity_.

If the ttl passed is _Infinity_, the ttl to be set can be set with this option. The unit is milliseconds.

**Warning** Cloudflare Workers KV's expirationTtl is 60 seconds minimum. The store is implemented in such a way that an error will occur if the value is less than that.

```ts
// `svelte-kit-connect-cloudflare-kv` implementation excerpts
const ONE_DAY_IN_SECONDS = 86400;
export default class KvStore implements Store {
	constructor(options: KvStoreOptions) {
		this.ttl = options.ttl || ONE_DAY_IN_SECONDS * 1000;
	}

	ttl: number;

	async set(id: string, storeData: SessionStoreData, ttl: number): Promise<void> {
		if (ttl < 60 * 1000)
			throw new Error(
				'ttl must be at least 60 * 1000. please refer to https://developers.cloudflare.com/workers/runtime-apis/kv#expiration-ttlhttps://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body.'
			);

		// omission ...

		// Infinite time does not support, so it is implemented separately.
		if (ttl !== Infinity) {
			// https://developers.cloudflare.com/api/operations/workers-kv-namespace-write-multiple-key-value-pairs#request-body
			await this.client.put(key, serialized, { expirationTtl: ttl / 1000 });
			return;
		}
		await this.client.put(key, serialized, { expirationTtl: this.ttl / 1000 });
	}
}
```

## License

[MIT licensed](./LICENSE)
