import request from 'supertest';
import server from '../../../../../../app.js';
import factories from '../../../../../../tests/factories/index.js';
import { CategorySchema } from '@tabroom/types';
import z from 'zod';

let tournId: number;
let categoryId: number;
let userkey: string;

beforeAll(async () => {
	({ id: tournId } = await factories.tourn.create());
	({ id: categoryId } = await factories.category.create({ tourn: tournId }));
	const { id: personId } = await factories.person.create({ site_admin: 1 });
	({ userkey } = await factories.session.create({ person: personId }));
});

describe('GET /tab/tourns/:tournId/categories', () => {
	it('Returns the categories for a tournament', async () => {
		const res = await request(server)
			.get(`/v1/tab/tourns/${tournId}/categories`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CategorySchema));
		expect(res.body).toHaveLength(1);
	});
});

describe('GET /tab/tourns/:tournId/categories/:categoryId', () => {
	it('Returns a single category', async () => {
		const res = await request(server)
			.get(`/v1/tab/tourns/${tournId}/categories/${categoryId}`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(CategorySchema);
		expect(res.body.id).toBe(categoryId);
	});
});
