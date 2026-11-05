import { RedisConnection, createIORedisClient, type QueueBaseOptions } from 'bullmq';
import { BullMQOtel } from 'bullmq-otel';
import { Redis } from 'ioredis';
import packageData from '../../../package.json' with { type: 'json' };
import config from '../../config.js';
import logger from '../../helpers/logger.js';

let redisDown = false;

/** Whether Redis is unreachable. Connection errors are logged once per outage here, so callers can skip them */
export function isRedisDown() {
	return redisDown;
}

// ioredis, not node-redis: BullMQ's node-redis adapter (through 6.7.0) loads its Lua scripts only
// once and never again after a reconnect, so after a Redis restart every job add fails with
// NOSCRIPT until the process restarts. ioredis re-sends scripts on a new connection.
// The factory lets the connection log an outage once; BullMQ still closes the clients it creates
RedisConnection.clientFactory = (opts) => {
	const { url, ...options } = opts;
	const client = new Redis(url ?? config.redis.url, {
		...options,
		// BullMQ's default backs off to 20s between attempts; keep reconnects within 5s of Redis returning
		retryStrategy: (times: number) => Math.min(times * 500, 5000),
	});

	// Registered before BullMQ wraps the client so the outage is marked before the queue sees the error
	client.on('error', (error) => {
		if (!redisDown) {
			redisDown = true;
			logger.warn(`Lost connection to Redis at ${new URL(config.redis.url).host}`, { 'event.name': 'redis.connection.lost', error });
		}
	});
	client.on('ready', () => {
		if (redisDown) {
			redisDown = false;
			logger.info(`Reconnected to Redis at ${new URL(config.redis.url).host}`, { 'event.name': 'redis.connection.restored' });
		}
	});

	return createIORedisClient(client);
};

/** Options shared by every Queue and Worker */
export const baseOptions: QueueBaseOptions = {
	connection: { url: config.redis.url },
	telemetry: config.telemetry.enabled
		? new BullMQOtel({ version: packageData.version, enableMetrics: true })
		: undefined,
};
