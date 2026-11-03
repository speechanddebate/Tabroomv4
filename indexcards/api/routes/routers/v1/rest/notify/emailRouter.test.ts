import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { UnsubscribeResponseSchema, UnsubscribeStatusSchema } from '@tabroom/types';
import server from '../../../../../../app.js';
import factories from '../../../../../../tests/factories/index.js';
import config from '../../../../../config.js';
import { db } from '../../../../../data/database.js';
import { unsubscribeToken } from '../../../../../services/notifications/unsubscribe.js';

const noEmailOf = async (id: number) => (await db.selectFrom('person').select('no_email').where('id', '=', id).executeTakeFirstOrThrow()).no_email;

const originalSecret = config.shared_secret;
const originalSchematsUrl = config.schemats_url;

beforeAll(() => {
	config.shared_secret = 'router test secret';
	config.schemats_url = 'https://www.example.org';
});

afterAll(() => {
	config.shared_secret = originalSecret;
	config.schemats_url = originalSchematsUrl;
});

describe('/rest/notify/email/unsubscribe/:token', () => {
	let Person: { id: number; email: string };
	let token: string;

	beforeEach(async () => {
		Person = await factories.person.create({ no_email: 0 });
		token = await unsubscribeToken(Person);
	});

	describe('GET', () => {
		it('says who the link is for without changing anything', async () => {
			const res = await request(server)
				.get(`/v1/rest/notify/email/unsubscribe/${token}`)
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res.body).toMatchSchema(UnsubscribeStatusSchema);
			expect(res.body).toEqual({ email: `${Person.email[0]}***${Person.email.slice(Person.email.indexOf('@'))}`, noEmail: false });
			expect(await noEmailOf(Person.id)).toBe(0);
		});

		it('reports a link that was already used', async () => {
			await db.updateTable('person').set({ no_email: 1 }).where('id', '=', Person.id).execute();

			const res = await request(server).get(`/v1/rest/notify/email/unsubscribe/${token}`).set('Accept', 'application/json').expect(200);

			expect(res.body.noEmail).toBe(true);
		});

		it('sends a browser to the unsubscribe page', async () => {
			const res = await request(server)
				.get(`/v1/rest/notify/email/unsubscribe/${token}`)
				.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
				.expect(302);

			expect(res.headers.location).toBe(`https://www.example.org/unsubscribe/${token}`);
			expect(await noEmailOf(Person.id)).toBe(0);
		});

		it('treats a request with no preference as an API call', async () => {
			const res = await request(server).get(`/v1/rest/notify/email/unsubscribe/${token}`);

			expect(res.status).toBe(200);
			expect(res.body.noEmail).toBe(false);
		});

		it.each([
			['a malformed token', 'not-a-token'],
			['a token for nobody', `999999999.${'A'.repeat(43)}`],
		])('refuses %s', async (_label, bad) => {
			const res = await request(server).get(`/v1/rest/notify/email/unsubscribe/${bad}`).set('Accept', 'application/json');

			expect(res).toBeProblemResponse(404);
		});

		it('refuses a tampered token or one for an old address', async () => {
			const tampered = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');
			const tamperedRes = await request(server).get(`/v1/rest/notify/email/unsubscribe/${tampered}`).set('Accept', 'application/json');
			expect(tamperedRes).toBeProblemResponse(404);

			await db.updateTable('person').set({ email: `changed_${Person.email}` }).where('id', '=', Person.id).execute();
			const staleRes = await request(server).get(`/v1/rest/notify/email/unsubscribe/${token}`).set('Accept', 'application/json');
			expect(staleRes).toBeProblemResponse(404);
		});

		it('refuses a token that is too long', async () => {
			const res = await request(server).get(`/v1/rest/notify/email/unsubscribe/${'A'.repeat(600)}`).set('Accept', 'application/json');

			expect(res).toBeProblemResponse(400);
		});

		it('refuses a token older than a year', async () => {
			const twoYearsAgo = Math.floor(Date.now() / 1000) - 2 * 365 * 24 * 60 * 60;
			const old = await unsubscribeToken(Person, twoYearsAgo);

			const res = await request(server).get(`/v1/rest/notify/email/unsubscribe/${old}`).set('Accept', 'application/json');

			expect(res).toBeProblemResponse(404);
		});
	});

	describe('POST', () => {
		it('opts the person out on a one-click POST from a mail provider: no cookie, form body', async () => {
			const res = await request(server)
				.post(`/v1/rest/notify/email/unsubscribe/${token}`)
				.type('form')
				.send('List-Unsubscribe=One-Click')
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res.body).toMatchSchema(UnsubscribeResponseSchema);
			expect(res.body.unsubscribed).toBe(true);
			expect(await noEmailOf(Person.id)).toBe(1);
		});

		it('opts the person out on a JSON POST from the page', async () => {
			await request(server).post(`/v1/rest/notify/email/unsubscribe/${token}`).set('Accept', 'application/json').expect(200);

			expect(await noEmailOf(Person.id)).toBe(1);
		});

		it('passes CSRF for a logged-in browser on the page', async () => {
			const { userkey } = await factories.session.create({ person: Person.id });

			await request(server).post(`/v1/rest/notify/email/unsubscribe/${token}`).asPerson(userkey).expect(200);

			expect(await noEmailOf(Person.id)).toBe(1);
		});

		it('is fine with being used twice', async () => {
			await request(server).post(`/v1/rest/notify/email/unsubscribe/${token}`).expect(200);
			const res = await request(server).post(`/v1/rest/notify/email/unsubscribe/${token}`).expect(200);

			expect(res.body.unsubscribed).toBe(true);
			expect(await noEmailOf(Person.id)).toBe(1);
		});

		it('refuses a bad token without touching anyone', async () => {
			const res = await request(server).post(`/v1/rest/notify/email/unsubscribe/${Person.id}.${'A'.repeat(43)}`);

			expect(res).toBeProblemResponse(404);
			expect(await noEmailOf(Person.id)).toBe(0);
		});
	});
});
