import request from 'supertest';
import server from '../../../../app.js';
import factories from '../../../../tests/factories/index.js';
import sessionRepo from '../../../repos/sessionRepo.js';
import personRepo from '../../../repos/personRepo.js';
import { db } from '../../../data/database.js';
import config from '../../../config.js';
import type { Response } from 'supertest';

const { addJobs } = vi.hoisted(() => ({ addJobs: vi.fn() }));
vi.mock('../../../services/queue/index.js', async (original) => ({ ...await original(), addJobs }));

/** The session key from the response's Set-Cookie header; login and register don't return it in the body */
function sessionKey(res: Response) {
	const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
	const cookie = cookies.find(c => c.startsWith(`${config.cookie.name}=`));
	return decodeURIComponent(cookie!.split(';')[0].slice(config.cookie.name.length + 1));
}

let adminId! : number, userId!: number;
describe('Auth Router', () => {
	beforeAll(async () => {
		({ id: adminId  } = await factories.person.create({
			site_admin: 1,
		}));
		({ id: userId } = await factories.person.create());
	});
	describe('/login' , () => {
		it('Logs in an existing user', async () => {
			const password = 'securepassword';
			const Person = await factories.person.create({ password });

			const res = await request(server)
				.post('/v1/auth/login')
				.send({
					username: Person.email,
					password: password,
				})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200);
			assert.isObject(res.body, 'Response is an object');
			expect(Object.keys(res.body)).toEqual(['Person']);

			const session = await sessionRepo.findByUserKey(db, sessionKey(res));
			expect(session).not.toBeNull();
			expect(session!.person).toBe(Person.id);
		});
		it('stores the browser in classic\'s agent_data shape', async () => {
			const password = 'securepassword';
			const Person = await factories.person.create({ password });

			const res = await request(server)
				.post('/v1/auth/login')
				.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
				.send({ username: Person.email, password })
				.expect(200);

			const { id } = (await sessionRepo.findByUserKey(db, sessionKey(res)))!;
			const row = await db.selectFrom('session').select('agent_data').where('id', '=', id).executeTakeFirstOrThrow();
			expect(JSON.parse(row.agent_data!)).toMatchObject({ browser: 'Chrome', browser_version: '131.0.0.0', os: 'Windows 10' });
		});
		it('Fails to log in with incorrect password', async () => {
			const Person = await factories.person.create({
				password: 'securepassword',
			});

			const res = await request(server)
				.post('/v1/auth/login')
				.send({
					username: Person.email,
					password: 'wrongpassword',
				})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/);

			expect(res).toBeProblemResponse(401);
		});
		it('returns 400 for missing credentials', async () => {
			const res = await request(server)
				.post('/v1/auth/login')
				.send({})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/);

			expect(res).toBeProblemResponse(400);
		});
		it('does not allow a banned user to log in', async () => {
			const Person = await factories.person.create({
				password: 'securepassword',
				settings: {
					banned: 1,
				},
			});
			
			const res = await request(server)
				.post('/v1/auth/login')
				.send({
					username: Person.email,
					password: 'securepassword',
				})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/);

			expect(res).toBeProblemResponse(403);
		});
	});
	describe('/logout', () => {
		it('logs out an existing user', async () => {
			const Person = await factories.person.create({
				password: 'securepassword',
			});

			const loginRes = await request(server)
				.post('/v1/auth/login')
				.send({
					username: Person.email,
					password: 'securepassword',
				})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200);

			const token = sessionKey(loginRes);

			await request(server)
				.post('/v1/auth/logout')
				.asPerson(token)
				.expect(204);

			const session = await sessionRepo.findByUserKey(db,token);
			expect(session).toBeUndefined();
		});

		it('removes the session\'s push subscription', async () => {
			const Person = await factories.person.create();
			const { id: sessionId, userkey } = await factories.session.create({ person: Person.id });
			const endpoint = `https://fcm.googleapis.com/fcm/send/logout-${sessionId}`;
			await db.updateTable('session').set({
				push_endpoint: endpoint,
				push_p256dh: 'p256dh',
				push_auth: 'auth',
				push_vapid_key: '0123456789abcdef',
			}).where('id', '=', sessionId).execute();

			await request(server)
				.post('/v1/auth/logout')
				.asPerson(userkey)
				.expect(204);

			const remaining = await db.selectFrom('session')
				.select('id')
				.where((eb) => eb.or([
					eb('id', '=', sessionId),
					eb('push_endpoint', '=', endpoint),
				]))
				.execute();
			expect(remaining).toEqual([]);
		});

	});
	describe('/register' , () => {
		it('Registers a new user', async () => {
			const personData = factories.person.createPersonData({
				password: 'securepassword',
			});
			const res = await request(server)
				.post('/v1/auth/register')
				.send({
					email: personData.email,
					password: personData.password,
					first: personData.first,
					last: personData.last,
				})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/);

			expect(res).not.toBeProblemResponse();
			assert.isObject(res.body, 'Response is an object');
			expect(Object.keys(res.body)).toEqual(['personId']);
			const person = await personRepo.getPerson(db, res.body.personId);
			expect(person).toBeDefined();
			expect((await sessionRepo.findByUserKey(db, sessionKey(res)))?.person).toBe(res.body.personId);
		});

		it('starts the new account unconfirmed and emails it a code ahead of blasts', async () => {
			addJobs.mockReset().mockResolvedValue(undefined);
			const personData = factories.person.createPersonData({ password: 'securepassword' });

			const res = await request(server)
				.post('/v1/auth/register')
				.send({ email: personData.email, password: personData.password, first: personData.first, last: personData.last })
				.expect(200);

			const person = await personRepo.getPerson(db, res.body.personId, { settings: ['email_unconfirmed', 'email_confirmation_key'] });
			expect(person?.no_email).toBe(1);
			expect(person?.settings).toMatchObject({ email_unconfirmed: expect.anything() });
			// 6 characters from the code alphabet (no 0, 1, I or O), e.g. HXK3QY
			expect(String(person?.settings?.email_confirmation_key)).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

			const jobs = addJobs.mock.calls.flatMap(([batch]) => batch as { queueName: string; data: Record<string, unknown>; opts: Record<string, unknown> }[]);
			expect(jobs).toEqual([expect.objectContaining({ queueName: 'email', data: expect.objectContaining({ ignoreNoEmail: true }) })]);
			expect(jobs[0].opts).not.toHaveProperty('priority');
		});
	});
	describe('/su', () => {
		it('starts an su session', async () => {
			const Person = await factories.person.create({
				site_admin: 1,
				password: 'securepassword',
			});

			const loginRes = await request(server)
				.post('/v1/auth/login')
				.send({
					username: Person.email,
					password: 'securepassword',
				})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200);

			const token = sessionKey(loginRes);

			const suTarget = await factories.person.create({
				password: 'securepassword',
			});

			const res = await request(server)
				.post('/v1/auth/su')
				.asPerson(token)
				.send({ suId: suTarget.id })
				//.expect(204);

			expect(res).not.toBeProblemResponse();
		});
		it('keeps the original admin when su\'ing again from inside an su session', async () => {
			const admin = await factories.person.create({ site_admin: 1 });
			const nextTarget = await factories.person.create();
			const { userkey } = await factories.session.create({ person: admin.id });
			// su requires the current person to be a site admin, so only an admin target can su again
			await request(server).post('/v1/auth/su').asPerson(userkey).send({ suId: adminId }).expect(204);

			const res = await request(server).post('/v1/auth/su').asPerson(userkey).send({ suId: nextTarget.id });

			const session = await sessionRepo.findByUserKey(db, userkey);
			expect(res.status).toBe(204);
			expect(session).toMatchObject({ person: nextTarget.id, su: admin.id });
		});
		it('fails to start an su session with invalid suId', async () => {
			const Person = await factories.person.create({
				site_admin: 1,
				password: 'securepassword',
			});

			const loginRes = await request(server)
				.post('/v1/auth/login')
				.send({
					username: Person.email,
					password: 'securepassword',
				})
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200);

			const token = sessionKey(loginRes);

			const res = await request(server)
				.post('/v1/auth/su')
				.asPerson(token)
				.send({ suId: 'string' })
				.expect(400);

			expect(res).toBeProblemResponse(400);
		});

	});
	describe('/suEnd',async () => {
		it('ends an su session', async () => {

			const { userkey } = await factories.session.create({
				person: userId,
				su: adminId,
			});

			const res = await request(server)
			.post('/v1/auth/suEnd')
			.asPerson(userkey)
			.expect(204);

			expect(res).not.toBeProblemResponse();
			const session = await sessionRepo.findByUserKey(db,userkey);
			expect(session).toBeDefined();
			expect(session!.su).toBeNull();
		});
	});
});