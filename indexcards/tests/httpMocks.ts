import type { NextFunction, Request, Response } from 'express';
import type { ValidatedRequest } from '../api/middleware/validation.js';
import { createActor } from '../api/middleware/authorization/authorization.js';
import { db } from '../api/data/database.js';
import { vi } from 'vitest';

export function createPersonContext(
	person: { id: number; first: string | null; last: string | null; email: string; site_admin: number | null },
	reqOverrides: Partial<ValidatedRequest> = {}
) {
	const Person = {
		id: person.id,
		first: person.first,
		last: person.last,
		email: person.email,
		site_admin: person.site_admin
	};
	reqOverrides = {
		auth: { method: 'cookie', sessionId: 1, su: null },
		person: Person,
		session: {
			id: 1,
			person: person.id,
			su: null,
			Person,
			Su: null,
		},
		...reqOverrides,
	};
	const con = createContext(reqOverrides);
	con.req.actor = createActor(con.req.db, con.req.person);
	return con;
}

//Mocks for unit testing middleware and controllers
export function createContext(reqOverrides: Partial<ValidatedRequest> = {}) {
	const req = createReq(reqOverrides);
	const res = createRes();

	return {
		req,
		res,
		next: vi.fn() as unknown as NextFunction,
	};
}

export function createReq(overrides: Partial<ValidatedRequest> & Record<string, unknown> = {}): Request {
	return {
		method: 'GET',
		headers: {},
		body: {},
		cookies: {},
		db,
		auth: { method: 'none', sessionId: null, su: null },
		person: null,
		session: undefined,
		params: {},
		query: {},
		get: () => {},
		...overrides,
	} as unknown as Request;
}
export type MockResponse = Response & {
	body: unknown;
};
export function createRes(): MockResponse {
	const headers: Record<string, string> = {};

	const res = {
		statusCode: 200,
		headers,
		body: undefined as unknown,
		setHeader: (key: string, value: string) => { headers[key.toLowerCase()] = value; },
		getHeader: (key: string) => headers[key.toLowerCase()],
		removeHeader: (key: string) => { delete headers[key.toLowerCase()]; },
		status: vi.fn(function(code: number) { res.statusCode = code; return res; }),
		json: vi.fn(function(body: unknown) { res.body = body; return res; }),
		send: vi.fn(function(body: unknown) { res.body = body; return res; }),
		end: vi.fn().mockReturnValue(undefined),
		set: vi.fn(function(field: string | Record<string, string>, value?: string) {
			if (typeof field === 'string') {
				res.setHeader(field, value!);
			} else {
				for (const k in field) res.setHeader(k, field[k]);
			}
			return res;
		}),
		type: vi.fn(function(type: string) {
			res.setHeader('content-type', type);
			return res;
		}),
		clearCookie: vi.fn().mockReturnValue(undefined),
		cookie: vi.fn(),
	};

	return res as unknown as MockResponse;
}
