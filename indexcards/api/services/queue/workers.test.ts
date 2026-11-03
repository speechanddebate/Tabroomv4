import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { closeWorkers, startWorkers } from './workers.js';

// Each Worker the module starts keeps its event handlers here, so a test can fire them
const { handlers, onFailed } = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	onFailed: vi.fn(),
}));
vi.mock('bullmq', async (importOriginal) => ({
	...await importOriginal<typeof import('bullmq')>(),
	Worker: class {
		on(event: string, handler: (...args: unknown[]) => unknown) {
			handlers.set(event, handler);
			return this;
		}
		async close() {}
	},
}));
vi.mock('./registry.js', async () => {
	const { defineQueue: define } = await vi.importActual<typeof import('./define.js')>('./define.js');
	return { queueDefinitions: [define({ name: 'things', processor: async () => undefined, onFailed })] };
});

/** A job as the failed event hands it over, after its attemptsMade-th attempt */
const failedJob = (attemptsMade: number) => ({ id: '7', name: 'thing', data: { id: 1 }, attemptsMade, opts: { attempts: 3 } });

/** Fires the failed event and lets the hook's promise settle */
async function fail(job: ReturnType<typeof failedJob>, error: Error) {
	handlers.get('failed')!(job, error);
	await new Promise((resolve) => setImmediate(resolve));
}

describe('worker failure hook', () => {
	const original = config.queue.runWorkers;

	beforeEach(() => {
		config.queue.runWorkers = true;
		handlers.clear();
		onFailed.mockReset().mockResolvedValue(undefined);
		vi.spyOn(logger, 'info').mockImplementation(() => logger);
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
		vi.spyOn(logger, 'error').mockImplementation(() => logger);
		startWorkers();
	});

	afterEach(async () => {
		await closeWorkers();
		config.queue.runWorkers = original;
		vi.restoreAllMocks();
	});

	it('runs once the last attempt fails', async () => {
		const job = failedJob(3);
		const error = new Error('relay down');

		await fail(job, error);

		expect(onFailed).toHaveBeenCalledWith(job, error);
	});

	it('runs when the job gives up early with UnrecoverableError', async () => {
		await fail(failedJob(1), new UnrecoverableError('bad data'));

		expect(onFailed).toHaveBeenCalledOnce();
	});

	it('does not run while the job has attempts left', async () => {
		await fail(failedJob(1), new Error('relay busy'));

		expect(onFailed).not.toHaveBeenCalled();
	});

	it('logs a hook that throws instead of letting it out', async () => {
		onFailed.mockRejectedValue(new Error('database down'));

		await fail(failedJob(3), new Error('relay down'));

		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failure hook failed'), expect.any(Error));
	});
});
