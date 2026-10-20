import factories from '../../tests/factories/index.js';
import { createPersonContext } from '../../tests/httpMocks.js';
import { requirePublicForAttn, requirePublicTourn } from './tournPolicy.js';

describe('requirePublicForAttn', () => {
	// a person's request for the tourn, with the actor holding the given role on it
	async function requestFor(tournId: number, { role, site_admin = 0 }: { role?: string, site_admin?: number } = {}) {
		const person = await factories.person.create({ site_admin });
		const context = createPersonContext(person, { params: { tournId: String(tournId) } });
		if (role) context.req.actor.grant([{ scope: 'tourn', id: tournId, role }]);
		return context;
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

	it.each(['checker', 'tabber', 'owner'])('passes a hidden tourn for a tourn %s', async (role) => {
		const tourn = await factories.tourn.create({ hidden: 1 });
		const { req, res, next } = await requestFor(tourn.id, { role });

		await requirePublicForAttn(req, res, next);

		expect(next).toHaveBeenCalledWith();
	});

	it('passes a hidden tourn for a site admin', async () => {
		const tourn = await factories.tourn.create({ hidden: 1 });
		const { req, res, next } = await requestFor(tourn.id, { site_admin: 1 });

		await requirePublicForAttn(req, res, next);

		expect(next).toHaveBeenCalledWith();
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
