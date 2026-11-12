import factories from '../../tests/factories/index.js';
import { createPersonContext } from '../../tests/httpMocks.js';
import { requirePublicForAttn, requirePublicTourn } from './tournPolicy.js';

describe('requirePublicForAttn', () => {
	// a person's request for the tourn, holding the given permission row on it
	async function requestFor(tournId: number, { role, site_admin = 0 }: { role?: string, site_admin?: number } = {}) {
		const person = await factories.person.create({ site_admin });
		if (role) await factories.permission.create({ person: person.id, tourn: tournId, tag: role });
		return createPersonContext(person, { params: { tournId: String(tournId) } });
	}

	it('passes a public tourn and loads it', async () => {
		const tourn = await factories.tourn.create();
		const { req, res, next } = await requestFor(tourn.id);

		await requirePublicForAttn(req, res, next);

		expect(next).toHaveBeenCalledWith();
		expect(req.tourn?.id).toBe(tourn.id);
	});

	it('returns 404 for a hidden tourn to an attendee', async () => {
		const tourn = await factories.tourn.create({ hidden: 1 });
		const { req, res, next } = await requestFor(tourn.id);

		await requirePublicForAttn(req, res, next);

		expect(res.statusCode).toBe(404);
		expect(next).not.toHaveBeenCalled();
	});

	// who counts as staff (tourn.staff) is relations.test.ts's job; one staff row stands in for all of them
	it('passes a hidden tourn for its staff', async () => {
		const tourn = await factories.tourn.create({ hidden: 1 });
		const { req, res, next } = await requestFor(tourn.id, { role: 'checker' });

		await requirePublicForAttn(req, res, next);

		expect(next).toHaveBeenCalledWith();
	});

	it('passes a hidden tourn for a site admin', async () => {
		const tourn = await factories.tourn.create({ hidden: 1 });
		const { req, res, next } = await requestFor(tourn.id, { site_admin: 1 });

		await requirePublicForAttn(req, res, next);

		expect(next).toHaveBeenCalledWith();
	});

	it.each([requirePublicForAttn, requirePublicTourn])('%o returns 400 for a malformed tournId, before any lookup', async (middleware) => {
		const { req, res, next } = createPersonContext(await factories.person.create(), { params: { tournId: 'abc' } });

		await middleware(req, res, next);

		expect(res.statusCode).toBe(400);
		expect(res.body).toMatchObject({ detail: 'tournId must be a positive integer' });
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 404 for a tourn that does not exist', async () => {
		const { req, res, next } = await requestFor(999999999, { site_admin: 1 });

		await requirePublicForAttn(req, res, next);

		expect(res.statusCode).toBe(404);
	});

	it('still leaves requirePublicTourn closed to tab staff', async () => {
		const tourn = await factories.tourn.create({ hidden: 1 });
		const { req, res, next } = await requestFor(tourn.id, { role: 'owner' });

		await requirePublicTourn(req, res, next);

		expect(res.statusCode).toBe(404);
	});
});
