import { emailQueue, notifyQueue, pushQueue } from '../notifications/queues.js';
import type { QueueDefinition } from './define.js';

/** Every queue the API opens and runs workers for. The one place that knows which features have queues */
export const queueDefinitions = [
	notifyQueue,
	emailQueue,
	pushQueue,
] as const satisfies readonly QueueDefinition[];

type Definition = typeof queueDefinitions[number];

export type QueueName = Definition['name'];

// Both type parameters are inferred together: a Job carries its result type too, so
// fixing one of them to unknown stops the other from matching

/** The data each queue's jobs carry. Ids only; the job loads the rest from the database */
export type QueueData = {
	[D in Definition as D['name']]: D extends QueueDefinition<string, infer Data, infer _Result> ? Data : never;
};

/** What each queue's jobs return when they finish */
export type QueueResult = {
	[D in Definition as D['name']]: D extends QueueDefinition<string, infer _Data, infer Result> ? Result : never;
};

export const queueNames = queueDefinitions.map(definition => definition.name);

export function getDefinition(name: QueueName): Definition {
	const definition = queueDefinitions.find(candidate => candidate.name === name);
	if (!definition) {
		throw new Error(`No queue named ${name}`);
	}
	return definition;
}
