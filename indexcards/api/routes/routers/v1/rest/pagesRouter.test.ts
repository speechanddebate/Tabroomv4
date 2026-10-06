import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { WebpageSchema } from '@tabroom/types';
import { faker } from '@faker-js/faker';
import z from 'zod';

describe('GET /rest/pages', () => {
	it('Returns the public sitewide pages', async () => {
		await factories.webpage.create({ sitewide: 1 });

		const res = await request(server)
			.get(`/v1/rest/pages`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(WebpageSchema));
		expect(res.body.length).toBeGreaterThan(0);
	});
});

describe('GET /rest/pages/:slug', () => {
	it('Returns a public sitewide page by slug', async () => {
		const slug = faker.string.alphanumeric(20);
		await factories.webpage.create({ sitewide: 1, slug });

		const res = await request(server)
			.get(`/v1/rest/pages/${slug}`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(WebpageSchema));
		expect(res.body[0].slug).toBe(slug);
	});
});
