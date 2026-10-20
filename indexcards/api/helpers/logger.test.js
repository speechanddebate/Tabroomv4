import Transport from 'winston-transport';
import EventEmitter from 'events';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import logger, { requestLogger, setupRequest } from './logger.js';

class CaptureTransport extends Transport {
	constructor() {
		super();
		this.entries = [];
	}

	log(info, callback) {
		this.entries.push(info);
		callback();
	}
}

describe('logger request context', () => {
	it('adds requestId from setupRequest across async boundaries', async () => {
		const req = { uuid: 'req-123' };
		const res = new EventEmitter();
		res.statusCode = 200;
		const captureTransport = new CaptureTransport();
		const originalSilent = logger.silent;
		const originalLevel = logger.level;

		logger.silent = false;
		logger.level = 'info';
		logger.add(captureTransport);

		await new Promise((resolve) => {
			setupRequest(req, res, async () => {
				await Promise.resolve();
				logger.info('test log');
				res.emit('finish');
				resolve();
			});
		});

		logger.remove(captureTransport);
		logger.silent = originalSilent;
		logger.level = originalLevel;

		expect(captureTransport.entries[0]?.requestId).toBe('req-123');
	});

});

describe('setupRequest route template', () => {
	beforeAll(() => {
		context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(() => {
		context.disable();
	});

	// what the http instrumentation puts in the context for each incoming request
	function handle(req) {
		const rpcMetadata = { type: RPCType.HTTP };
		const res = new EventEmitter();
		res.statusCode = 200;
		context.with(setRPCMetadata(ROOT_CONTEXT, rpcMetadata), () => setupRequest(req, res, () => {}));
		res.emit('finish');
		return rpcMetadata;
	}

	it('gives the http metric and the request log the openapi path of the matched route', () => {
		const info = vi.spyOn(requestLogger, 'info');

		const rpcMetadata = handle({
			originalUrl: '/v1/tab/12345/rounds/678',
			baseUrl: '/v1/tab/12345/rounds',
			route: { path: '/:roundId', openapi: { path: '/tab/{tournId}/rounds/{roundId}' } },
		});

		expect(rpcMetadata.route).toBe('/tab/{tournId}/rounds/{roundId}');
		expect(info).toHaveBeenCalledWith('Request handled', expect.objectContaining({
			route: '/tab/{tournId}/rounds/{roundId}',
		}));
	});

	it('leaves the route unset when no route matched', () => {
		const info = vi.spyOn(requestLogger, 'info');

		const rpcMetadata = handle({ originalUrl: '/wp-admin/setup.php' });

		expect(rpcMetadata.route).toBeUndefined();
		expect(info).toHaveBeenCalledWith('Request handled', expect.objectContaining({ route: null }));
	});
});