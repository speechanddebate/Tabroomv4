import { RedisConnection, createNodeRedisClient, type QueueBaseOptions } from 'bullmq';
import { BullMQOtel } from 'bullmq-otel';
import { createClient } from 'redis';
import packageData from '../../../package.json' with { type: 'json' };
import config from '../../config.js';
import logger from '../../helpers/logger.js';

let redisDown = false;

/** Whether Redis is unreachable. Connection errors are logged once per outage here, so callers can skip them */
export function isRedisDown() {
	return redisDown;
}

// BullMQ defaults to ioredis. The factory makes it build node-redis clients instead, and since
// BullMQ creates them it also closes them when the queue or worker closes
RedisConnection.clientFactory = (opts) => {
	const client = createClient({
		url: opts.url,
		name: opts.connectionName,
		socket: {
			// node-redis retries every few ms by default, which floods the log while Redis is down
			reconnectStrategy: (retries) => Math.min(retries * 500, 5000),
		},
	});

	// Registered before BullMQ wraps the client so the outage is marked before the queue sees the error
	client.on('error', (error) => {
		if (!redisDown) {
			redisDown = true;
			logger.warn(`Lost connection to Redis at ${new URL(config.redis.url).host}`, error);
		}
	});
	client.on('ready', () => {
		if (redisDown) {
			redisDown = false;
			logger.info(`Reconnected to Redis at ${new URL(config.redis.url).host}`);
		}
	});

	return createNodeRedisClient(client);
};

/** Options shared by every Queue and Worker */
export const baseOptions: QueueBaseOptions = {
	connection: { url: config.redis.url },
	telemetry: config.telemetry.enabled
		? new BullMQOtel({ version: packageData.version, enableMetrics: true })
		: undefined,
};
