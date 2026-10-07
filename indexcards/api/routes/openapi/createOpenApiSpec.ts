import * as schemas from '@tabroom/types';
import { createDocument } from 'zod-openapi';
import * as responses from './responses/index.js';
import { tags as declaredTags } from './tags.js';
import logger from '../../helpers/logger.js';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import security from './security.js';

import type { ZodOpenApiObject } from 'zod-openapi';
import type { OpenAPIObject, TagObject } from 'openapi3-ts/oas32';
import type { RouteOpenApiConfig, RouteOperation } from '../../types/express.d.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type RouteOperationConfig = RouteOperation & { path: string };

type RouterLike = {
	stack?: unknown[];
};

const pkg = JSON.parse(
	await readFile(
		new URL('../../../package.json', import.meta.url),
		'utf8'
	)
);
/**
 * Build the OpenAPI spec from an Express router.
 * - Collects all paths + operations
 * - Collects all tags actually used by operations, plus their parent tags
 * - Automatically adds missing tags to `spec.tags`
 */
export function createOpenApiSpec(apiRouter: RouterLike): OpenAPIObject {
	// Collect paths + used tags
	const { paths, usedTags } = collectOpenApi(apiRouter);
	const tags = buildTags(declaredTags, usedTags);

	const doc: ZodOpenApiObject = {
		openapi: '3.2.0',
		servers: [{ url: '/v1' }],
		info: {
			title: 'IndexCards API',
			version: pkg.version,
			description: 'Tabroom.com data & operational API',
			termsOfService: 'https://www.speechanddebate.org/terms-conditions/',
			license: {
				name: 'Copyright 2014-2021, National Speech & Debate Association',
				identifier: pkg.license,
			},
		},
		security: security.defaultSecurity,
		tags,
		paths,
		components: {
			schemas,
			responses,
			securitySchemes: security.schemes,
		},
	};
	return createDocument(doc,{
		reused: 'inline',
	});
}

/**
 * Recursively collect OpenAPI paths and tags from an Express router
 */
export function collectOpenApi(router: RouterLike) {
	const paths: Record<string, Record<string, unknown>> = {};
	const usedTags = new Set<string>();

	for (const layer of (router.stack ?? []) as Array<Record<string, unknown>>) {
		const route = layer.route as undefined | {
			path?: string;
			methods?: Record<string, unknown>;
			openapi?: RouteOpenApiConfig;
		};

		if (route) {

			for (const method of Object.keys(route.methods ?? {})) {
				if (!isHttpMethodKey(method)) {
					continue;
				}

				const openapi = getOpenApiForMethod(route.openapi, method);

				// Routes must have explicit .openapi.path set at definition time
				if (!openapi?.path) {
					logger.warn(`Route ${route.path} missing .openapi.path, skipping`);
					continue;
				}

				const op = normalizeOperation(
					method,
					openapi.path,
					openapi
				);

				paths[openapi.path] ??= {};
				paths[openapi.path][method] = op;

				for (const tag of op.tags) {
					usedTags.add(tag);
				}
			}
		}

		// Case 2: Nested router
		const handle = layer.handle as undefined | RouterLike;
		if (layer.name === 'router' && handle?.stack) {
			const child = collectOpenApi(handle);

			Object.assign(paths, child.paths);
			child.usedTags.forEach((t: string) => usedTags.add(t));
		}
	}

	return { paths, usedTags };
}

function isRouteOperationConfig(openapi: RouteOpenApiConfig): openapi is RouteOperationConfig {
	return !Object.keys(openapi).some(isHttpMethodKey);
}

function getOpenApiForMethod(openapi: RouteOpenApiConfig | undefined, method: HttpMethod): RouteOperationConfig | undefined {
	if (!openapi || typeof openapi !== 'object') {
		return undefined;
	}

	const openapiRecord = openapi as Record<string, unknown> & { path: string };
	const methodConfig = openapiRecord[method];

	if (!methodConfig || typeof methodConfig !== 'object') {
		return isRouteOperationConfig(openapi) ? openapi : undefined;
	}

	const shared = Object.fromEntries(
		Object.entries(openapiRecord).filter(([key]) => !isHttpMethodKey(key))
	);

	return {
		...shared,
		...(methodConfig as Record<string, unknown>),
		path: (methodConfig as { path?: string }).path ?? (shared.path as string | undefined) ?? openapiRecord.path,
	} as RouteOperationConfig;
}

function isHttpMethodKey(key: string): key is HttpMethod {
	return HTTP_METHODS.includes(key as HttpMethod);
}

function normalizeOperation(method: HttpMethod, routePath: string, openapi: RouteOperationConfig) {
	assertZodParams(method, routePath, openapi);

	// Exclude path property (used for routing, not OpenAPI)
	const opWithoutPath = Object.fromEntries(
		Object.entries(openapi).filter(([key]) => key !== 'path')
	);

	const existingResponses = openapi.responses && typeof openapi.responses === 'object'
		? Object.fromEntries(Object.entries(openapi.responses).map(([code, response]) => [String(code), response]))
		: { 200: { description: 'Success' } };

	return {
		...opWithoutPath,
		summary:
			openapi.summary ??
			`${method.toUpperCase()} ${routePath}`,

		description:
			openapi.description ??
			`${method.toUpperCase()} ${routePath} is undocumented. Need to add .openapi to handler`,

		tags:
			Array.isArray(openapi.tags) ? openapi.tags : [],

		//add a 401 and 500 error to every endpoint and a 200 if nothing was defined
		responses: {
			...existingResponses,
			...Object.fromEntries(
				Object.entries({
					500 : { $ref: '#/components/responses/ErrorResponse' },
					401 : { $ref : '#/components/responses/Unauthorized'},
				})
					.filter(([code]) => !(code in existingResponses))
			),
		},
	};
}

/**
 * all params are declared with zod (requestParams; the route config type has no raw parameters),
 * which zod-openapi turns into parameters. fail the build for a {param} in the path that isn't declared
 */
function assertZodParams(method: HttpMethod, routePath: string, openapi: RouteOperationConfig) {
	const route = `${method.toUpperCase()} ${routePath}`;
	const pathSchema = openapi.requestParams?.path as { shape?: Record<string, unknown> } | undefined;
	const declared = new Set(Object.keys(pathSchema?.shape ?? {}));
	const undeclared = [...routePath.matchAll(/\{([^}]+)\}/g)]
		.map(m => m[1])
		.filter(name => !declared.has(name));

	if (undeclared.length) {
		throw new Error(`${route}: path params ${undeclared.join(', ')} must be declared in requestParams.path`);
	}
}

/**
 * Keep the declared tags that are used by an operation or are a parent of one, and add
 * used tags that were never declared. Any top level tag without children is nested
 * under "Other" so the scalar sidebar stays grouped.
 */
function buildTags(declared: TagObject[], usedTags: Set<string>): TagObject[] {
	const declaredByName = new Map(declared.map(tag => [tag.name, tag]));
	const keep = new Set<string>();

	for (const name of usedTags) {
		let current: string | undefined = name;
		while (current && !keep.has(current)) {
			keep.add(current);
			const parent: string | undefined = declaredByName.get(current)?.parent;
			if (parent && !declaredByName.has(parent)) {
				logger.warn(`OpenAPI tag ${current} has undeclared parent ${parent}`);
			}
			current = parent;
		}
	}

	for (const tag of declared) {
		if (!keep.has(tag.name)) {
			logger.warn(`Unused OpenAPI tag: ${tag.name}`);
		}
	}

	const tags: TagObject[] = [
		...declared.filter(tag => keep.has(tag.name)),
		...[...usedTags]
			.filter(name => !declaredByName.has(name))
			.sort()
			.map(name => ({ name })),
	];

	const parents = new Set(tags.flatMap(tag => tag.parent ?? []));
	const ungrouped = new Set(
		tags.filter(tag => !tag.parent && !parents.has(tag.name)).map(tag => tag.name)
	);

	if (ungrouped.size === 0) {
		return tags;
	}

	return [
		...tags.map(tag => (ungrouped.has(tag.name) ? { ...tag, parent: 'Other' } : tag)),
		{ name: 'Other' },
	];
}

/**
 * Write the spec to api/routes/openapi/openapi.json (gitignored) for schemats' orval client.
 * Returns the path written to.
 */
export async function writeOpenApiSpec(spec: OpenAPIObject): Promise<string> {
	const outputPath = fileURLToPath(new URL('./openapi.json', import.meta.url));
	await writeFile(outputPath, JSON.stringify(spec, null, 2));
	return outputPath;
}
