import { Router } from 'express';
import z from 'zod';
import { collectOpenApi, createOpenApiSpec } from './createOpenApiSpec.js';
describe('collectOpenApi', () => {
	it('should collect OpenAPI metadata from .route form', () => {
		const router = Router();
		router.route('/foo').get((req, res) => {
			res.send('ok');
		}).openapi = {
			path: '/foo',
			operationId: 'Foo',
			summary: '/foo',
		};

		const result = collectOpenApi(router);

		expect(result.paths['/foo']['get']).toBeDefined();
		expect(result.paths['/foo']['get'].operationId).toBe('Foo');
		expect(result.paths['/foo']['get'].summary).toBe('/foo');
	});
	it('should collect OpenAPI metadata from nested routers', () => {
		const router = Router();
		const childRouter = Router();
		childRouter.route('/bar').get((req, res) => {
			res.send('ok');
		}).openapi = {
			path: '/bar',
			summary: '/bar',
		};
		router.use('/child', childRouter);

		const result = collectOpenApi(router);

		expect(result.paths['/bar']['get']).toBeDefined();
		expect(result.paths['/bar']['get'].summary).toBe('/bar');
	});

	it('should collect method-specific OpenAPI metadata from a shared route', () => {
		const router = Router();
		const shared = router.route('/item/:id');
		shared.get((req, res) => res.send('ok'));
		shared.delete((req, res) => res.send('ok'));

		shared.openapi = {
			path: '/item/{id}',
			requestParams: {
				path: z.object({ id: z.coerce.number().int() }),
			},
			get: {
				operationId: 'GetItem',
				summary: 'get item',
			},
			delete: {
				operationId: 'DeleteItem',
				summary: 'delete item',
			},
		};

		const result = collectOpenApi(router);

		expect(result.paths['/item/{id}']['get'].operationId).toBe('GetItem');
		expect(result.paths['/item/{id}']['delete'].operationId).toBe('DeleteItem');
	});
});

describe('createOpenApiSpec', () => {
	it('adds default 401/500 responses to operations', () => {
		const router = Router();
		router.route('/spec-defaults').get((req, res) => {
			res.send('ok');
		}).openapi = {
			path: '/spec-defaults',
			summary: 'defaults route',
			responses: {
				200: { description: 'ok' },
			},
		};

		const spec = createOpenApiSpec(router);
		const op = spec.paths['/spec-defaults'].get;

		expect(op).toBeDefined();
		expect(op.responses['200']).toBeDefined();
		expect(op.responses['401']).toEqual({ $ref: '#/components/responses/Unauthorized' });
		expect(op.responses['500']).toEqual({ $ref: '#/components/responses/ErrorResponse' });
	});

	it('builds get/delete operations from shared route config', () => {
		const router = Router();
		const shared = router.route('/spec-items/:id');
		shared.get((req, res) => res.send('ok'));
		shared.delete((req, res) => res.send('ok'));

		shared.openapi = {
			path: '/spec-items/{id}',
			tags: ['User: Inbox'],
			requestParams: { path: z.object({ id: z.coerce.number().int() }) },
			get: {
				summary: 'Get item',
				responses: { 200: { description: 'get ok' } },
			},
			delete: {
				summary: 'Delete item',
				responses: { 204: { description: 'delete ok' } },
			},
		};

		const spec = createOpenApiSpec(router);
		const getOp = spec.paths['/spec-items/{id}'].get;
		const deleteOp = spec.paths['/spec-items/{id}'].delete;

		expect(getOp.summary).toBe('Get item');
		expect(deleteOp.summary).toBe('Delete item');
		expect(getOp.tags).toContain('User: Inbox');
		expect(deleteOp.tags).toContain('User: Inbox');
		expect(getOp.responses['500']).toEqual({ $ref: '#/components/responses/ErrorResponse' });
		expect(deleteOp.responses['401']).toEqual({ $ref: '#/components/responses/Unauthorized' });
	});

	describe('path params', () => {
		const specFor = (openapi) => {
			const router = Router();
			router.route('/spec-params/:itemId').get((req, res) => res.send('ok')).openapi = {
				path: '/spec-params/{itemId}',
				responses: { 200: { description: 'ok' } },
				...openapi,
			};
			return createOpenApiSpec(router);
		};

		it('documents params declared with zod once', () => {
			const spec = specFor({ requestParams: { path: z.object({ itemId: z.coerce.number().int() }) } });
			const params = spec.paths['/spec-params/{itemId}'].get.parameters;

			expect(params.filter(param => param.name === 'itemId')).toHaveLength(1);
			expect(params[0]).toMatchObject({ in: 'path', name: 'itemId', required: true });
		});

		it('rejects a path param that is not declared with zod', () => {
			expect(() => specFor({})).toThrow('GET /spec-params/{itemId}: path params itemId must be declared in requestParams.path');
		});

	});
});
