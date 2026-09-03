import type { ZodOpenApiOperationObject, ZodOpenApiPathItemObject } from 'zod-openapi';

export type RouteOpenApiConfig = (ZodOpenApiPathItemObject | ZodOpenApiOperationObject) & {
	path: string;
};

declare module 'express-serve-static-core' {
	interface IRoute<Route extends string = string> {
		openapi?: RouteOpenApiConfig;
	}
	interface Request {
		actor: {
			Person?: {
				id: number;
			};
		}; // Replace `any` with the actual type of `actor` if available
		valid: {
			// oxlint-disable-next-line typescript/no-explicit-any
			body:any;
			// oxlint-disable-next-line typescript/no-explicit-any
			params:any;
			// oxlint-disable-next-line typescript/no-explicit-any
			query:any;
		};
	}
}

