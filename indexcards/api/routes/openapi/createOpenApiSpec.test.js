import { Router } from 'express';
import z from 'zod';
import { collectOpenApi, createOpenApiSpec } from './createOpenApiSpec.js';
import { requireAccess, requirePerson, requireSiteAdmin } from '../../middleware/auth/authorization.js';
import { optionalAuth, requireAuth } from './security.js';
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
			tags: ['user:inbox'],
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
		expect(getOp.tags).toContain('user:inbox');
		expect(deleteOp.tags).toContain('user:inbox');
		expect(getOp.responses['500']).toEqual({ $ref: '#/components/responses/ErrorResponse' });
		expect(deleteOp.responses['401']).toEqual({ $ref: '#/components/responses/Unauthorized' });
	});

	describe('tags', () => {
		const specWithTags = (tags) => {
			const router = Router();
			router.route('/spec-tags').get((req, res) => res.send('ok')).openapi = {
				path: '/spec-tags',
				tags,
				responses: { 200: { description: 'ok' } },
			};
			return createOpenApiSpec(router);
		};

		it('is a 3.2 document without x-tagGroups', () => {
			const spec = specWithTags(['user:inbox']);

			expect(spec.openapi).toBe('3.2.0');
			expect(spec['x-tagGroups']).toBeUndefined();
		});

		it('includes the parent of a used tag even though the parent has no operations', () => {
			const spec = specWithTags(['user:inbox']);

			expect(spec.tags.find(tag => tag.name === 'user:inbox').parent).toBe('User');
			expect(spec.tags.map(tag => tag.name)).toContain('User');
			expect(spec.tags.map(tag => tag.name)).not.toContain('Admin');
		});

		it('nests top level tags without children under Other', () => {
			const spec = specWithTags(['Ads', 'Undeclared Tag']);

			expect(spec.tags.find(tag => tag.name === 'Ads').parent).toBe('Other');
			expect(spec.tags.find(tag => tag.name === 'Undeclared Tag').parent).toBe('Other');
			expect(spec.tags.at(-1)).toEqual({ name: 'Other' });
		});
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

	describe('security', () => {
		const ok = (req, res) => res.send('ok');
		const op = (path) => ({ path, responses: { 200: { description: 'ok' } } });

		it('requires auth when the route has auth middleware', () => {
			const router = Router();
			router.route('/guarded').get(requirePerson, ok).openapi = op('/guarded');
			router.route('/open').get(ok).openapi = op('/open');

			const spec = createOpenApiSpec(router);

			expect(spec.paths['/guarded'].get.security).toEqual(requireAuth);
			expect(spec.paths['/open'].get.security).toBeUndefined();
		});

		it('requires auth on requireAccess routes, including path params', () => {
			const router = Router();
			router.route('/tourns/:tournId').get(requireAccess('tourn', 'read'), ok).openapi = {
				...op('/tourns/{tournId}'),
				requestParams: { path: z.object({ tournId: z.coerce.number().int() }) },
			};

			const spec = createOpenApiSpec(router);

			expect(spec.paths['/tourns/{tournId}'].get.security).toEqual(requireAuth);
		});

		it('only applies to the guarded method of a shared route', () => {
			const router = Router();
			const shared = router.route('/shared');
			shared.get(ok);
			shared.post(requireSiteAdmin, ok);
			shared.openapi = { path: '/shared', get: { summary: 'get' }, post: { summary: 'post' } };

			const spec = createOpenApiSpec(router);

			expect(spec.paths['/shared'].get.security).toBeUndefined();
			expect(spec.paths['/shared'].post.security).toEqual(requireAuth);
		});

		it('requires auth on routes mounted behind auth middleware', () => {
			const router = Router();
			const user = Router();
			const nested = Router();
			nested.route('/items').get(ok).openapi = op('/user/inbox/items');
			user.use('/inbox', nested);
			user.route('/profile').get(ok).openapi = op('/user/profile');
			router.use('/user', requirePerson, user);

			const pub = Router();
			pub.route('/thing').get(ok).openapi = op('/public/thing');
			router.use('/public', pub);

			const spec = createOpenApiSpec(router);

			expect(spec.paths['/user/profile'].get.security).toEqual(requireAuth);
			expect(spec.paths['/user/inbox/items'].get.security).toEqual(requireAuth);
			expect(spec.paths['/public/thing'].get.security).toBeUndefined();
		});

		it('requires auth on everything after a pathless router.use', () => {
			const router = Router();
			router.route('/before').get(ok).openapi = op('/before');
			router.use(requireAccess('chapter', 'write'));
			router.route('/after').get(ok).openapi = op('/after');

			const spec = createOpenApiSpec(router);

			expect(spec.paths['/before'].get.security).toBeUndefined();
			expect(spec.paths['/after'].get.security).toEqual(requireAuth);
		});

		it('keeps security declared on the route', () => {
			const router = Router();
			router.route('/optional').get(requirePerson, ok).openapi = { ...op('/optional'), security: optionalAuth };
			router.route('/login').post(requirePerson, ok).openapi = { ...op('/login'), security: [] };

			const spec = createOpenApiSpec(router);

			expect(spec.paths['/optional'].get.security).toEqual(optionalAuth);
			expect(spec.paths['/login'].post.security).toEqual([]);
		});
	});
});
