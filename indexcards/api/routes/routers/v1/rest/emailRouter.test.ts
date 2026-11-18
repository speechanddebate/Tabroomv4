import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { db } from '../../../../data/database.js';
import { signToken } from '../../../../services/tokens.js';
import { CONFIRMATION_MAX_AGE, sendConfirmation } from '../../../../services/profile/emailConfirm.js';
import { unsubscribeToken } from '../../../../services/notifications/unsubscribe.js';
import { EmailConfirmResponseSchema, EmailConfirmStatusSchema } from '@tabroom/types';

const { addJobs } = vi.hoisted(() => ({ addJobs: vi.fn() }));
vi.mock('../../../../services/queue/index.js', async (original) => ({ ...await original(), addJobs }));

const DAY = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const status = (token: string) => request(server).get(`/v1/rest/email/confirm/${token}`);
const confirm = (token: string) => request(server).post(`/v1/rest/email/confirm/${token}`);

describe('Email Router', () => {
	const personIds: number[] = [];

	/** A person waiting to confirm with this code, and the link token sendConfirmation would mail them */
	async function unconfirmed(code = 'HXK3QY', issuedAt?: number) {
		const Person = await factories.person.create({ no_email: 1, settings: { email_unconfirmed: 1, email_confirmation_key: code } });
		personIds.push(Person.id);
		const token = await signToken('confirm-email', Person.id, { email: Person.email!.trim().toLowerCase(), code }, CONFIRMATION_MAX_AGE, issuedAt);
		return { id: Person.id, email: Person.email!, token };
	}

	const confirmation = async (id: number) => {
		const settings = await db.selectFrom('person_setting').select(['tag', 'value'])
			.where('person', '=', id)
			.where('tag', 'in', ['email_unconfirmed', 'email_confirmation_key'])
			.execute();
		const person = await db.selectFrom('person').select('no_email').where('id', '=', id).executeTakeFirstOrThrow();
		return { settings: settings.length, noEmail: person.no_email };
	};

	beforeEach(() => {
		addJobs.mockReset().mockResolvedValue(undefined);
	});

	afterAll(async () => {
		await db.deleteFrom('message').where('person', 'in', personIds).execute();
		await db.deleteFrom('person_setting').where('person', 'in', personIds).execute();
		await db.deleteFrom('person').where('id', 'in', personIds).execute();
	});

	describe('GET /v1/rest/email/confirm/:token', () => {
		it('says which address the link is for, masked, and changes nothing', async () => {
			const { id, email, token } = await unconfirmed();

			const res = await status(token).expect(200);

			expect(res.body).toMatchSchema(EmailConfirmStatusSchema);
			expect(res.body).toEqual({ email: `${email[0]}***${email.slice(email.indexOf('@'))}`, confirmed: false });
			expect(await confirmation(id)).toEqual({ settings: 2, noEmail: 1 });
		});
	});

	describe('POST /v1/rest/email/confirm/:token', () => {
		it('confirms with no login and turns email back on', async () => {
			const { id, token } = await unconfirmed();

			const res = await confirm(token).expect(200);

			expect(res.body).toMatchSchema(EmailConfirmResponseSchema);
			expect(res.body.confirmed).toBe(true);
			expect(await confirmation(id)).toEqual({ settings: 0, noEmail: 0 });
		});

		it('answers a second use the same way, and status then says confirmed', async () => {
			const { token } = await unconfirmed();

			await confirm(token).expect(200);
			await confirm(token).expect(200);

			expect((await status(token).expect(200)).body.confirmed).toBe(true);
		});

		it('confirms from the link in the email sendConfirmation queues', async () => {
			const Person = await factories.person.create({ no_email: 0 });
			personIds.push(Person.id);

			await sendConfirmation(db, { id: Person.id, email: Person.email! });

			const message = await db.selectFrom('message').select('body').where('person', '=', Person.id).executeTakeFirstOrThrow();
			// The token after /confirm-email/ in the button's href, e.g. https://www.tabroom.com/confirm-email/eyJhbGci.eyJzdWIi.oT98vQOW
			const token = message.body!.match(/\/confirm-email\/([\w.-]+)/)![1];
			await confirm(token).expect(200);
			expect(await confirmation(Person.id)).toEqual({ settings: 0, noEmail: 0 });
		});
	});

	describe('links that no longer work', () => {
		it('refuses a link a newer code replaced', async () => {
			const { id, token } = await unconfirmed('HXK3QY');
			await db.updateTable('person_setting').set({ value: 'MW4PTB' })
				.where('person', '=', id).where('tag', '=', 'email_confirmation_key').execute();

			expect(await status(token).expect(404)).toBeProblemResponse(404);
			expect(await confirm(token).expect(404)).toBeProblemResponse(404);
			expect(await confirmation(id)).toEqual({ settings: 2, noEmail: 1 });
		});

		it('refuses a link for an address the person no longer has', async () => {
			const { id, token } = await unconfirmed();
			await db.updateTable('person').set({ email: `changed-${id}@example.org` }).where('id', '=', id).execute();

			await confirm(token).expect(404);
			expect(await confirmation(id)).toEqual({ settings: 2, noEmail: 1 });
		});

		it('says a link over 7 days old has expired', async () => {
			const { id, token } = await unconfirmed('HXK3QY', nowSeconds() - 8 * DAY);

			expect(await status(token).expect(410)).toBeProblemResponse(410);
			expect(await confirm(token).expect(410)).toBeProblemResponse(410);
			expect(await confirmation(id)).toEqual({ settings: 2, noEmail: 1 });
		});

		it('refuses a tampered link and another audience\'s token', async () => {
			const { id, email, token } = await unconfirmed();
			const tampered = token.slice(0, -6) + (token.at(-6) === 'A' ? 'B' : 'A') + token.slice(-5);

			await confirm(tampered).expect(404);
			await confirm(await unsubscribeToken({ id, email })).expect(404);
			await confirm('not-a-token').expect(404);
			expect(await confirmation(id)).toEqual({ settings: 2, noEmail: 1 });
		});
	});
});
