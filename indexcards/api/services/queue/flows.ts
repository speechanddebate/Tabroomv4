import { FlowProducer, type JobNode } from 'bullmq';
import logger from '../../helpers/logger.js';
import { baseOptions, isRedisDown } from './connection.js';
import type { FlowNode } from './define.js';

let producer: FlowProducer | undefined;

function getFlowProducer(): FlowProducer {
	if (!producer) {
		producer = new FlowProducer(baseOptions);
		producer.on('error', (error) => {
			if (!isRedisDown()) {
				logger.error('Job flow producer error', { 'event.name': 'queue.flow.exception', error });
			}
		});
	}
	return producer;
}

/**
 * Adds a parent job that runs once every child has finished. Children go to their own
 * queues as usual; the parent reads their results with getChildrenValues(). Build each
 * node with its queue definition's job(), which fills in the queue's options
 */
export async function addFlow(parent: FlowNode, children: FlowNode[]): Promise<JobNode> {
	return await getFlowProducer().add({ ...parent, children });
}

/** Close the flow producer's connection, if one was opened */
export async function closeFlows() {
	const open = producer;
	producer = undefined;
	await open?.close();
}
