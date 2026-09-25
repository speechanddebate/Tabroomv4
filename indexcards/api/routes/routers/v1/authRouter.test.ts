import request from 'supertest';
import server from '../../../../app.js';
import factories from '../../../../tests/factories/index.js';
import sessionRepo from '../../../repos/sessionRepo.js';
import personRepo from '../../../repos/personRepo.js';
import { hashPassword } from '../../../services/AuthService.js';
import { db } from '../../../data/database.js';

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
			const Person = await factories.person.create({
				password: hashPassword(password),
			});

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
			assert.containsAllKeys(res.body, ['Person', 'token'], 'Response has person object and session token');

			const session = await sessionRepo.findByUserKey(db,res.body.token);
			expect(session).not.toBeNull();
			expect(session!.person).toBe(Person.id);
		});
		it('Fails to log in with incorrect password', async () => {
			const Person = await factories.person.create({
				password: hashPassword('securepassword'),
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
				password: hashPassword('securepassword'),
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
				password: hashPassword('securepassword'),
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

			const token = loginRes.body.token;

			await request(server)
				.post('/v1/auth/logout')
				.set('Authorization', `Bearer ${token}`)
				.expect(204);

			const session = await sessionRepo.findByUserKey(db,token);
			expect(session).toBeUndefined();
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
			assert.containsAllKeys(res.body, ['personId', 'token'], 'Response has personId and session token');
			const person = await personRepo.getPerson(db, res.body.personId);
			expect(person).toBeDefined();
		});
	});
	describe('/su', () => {
		it('starts an su session', async () => {
			const Person = await factories.person.create({
				site_admin: 1,
				password: hashPassword('securepassword'),
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

			const token = loginRes.body.token;

			const suTarget = await factories.person.create({
				password: hashPassword('securepassword'),
			});

			const res = await request(server)
				.post('/v1/auth/su')
				.set('Authorization', `Bearer ${token}`)
				.send({ suId: suTarget.id })
				//.expect(204);

			expect(res).not.toBeProblemResponse();
		});
		it('fails to start an su session with invalid suId', async () => {
			const Person = await factories.person.create({
				site_admin: 1,
				password: hashPassword('securepassword'),
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

			const token = loginRes.body.token;

			const res = await request(server)
				.post('/v1/auth/su')
				.set('Authorization', `Bearer ${token}`)
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
			.set('Authorization', `Bearer ${userkey}`)
			.expect(204);

			expect(res).not.toBeProblemResponse();
			const session = await sessionRepo.findByUserKey(db,userkey);
			expect(session).toBeDefined();
			expect(session!.su).toBeNull();
		});
	});
});