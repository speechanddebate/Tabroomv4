import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import factories from '../../indexcards/tests/factories/index.js';

export const API_URL = process.env.API_URL ?? 'https://api.e2e.tabroom.test';
export const APP_ORIGIN = new URL(process.env.BASE_URL ?? 'https://e2e.tabroom.test').origin;
export const AUTH_COOKIE = 'TabroomToken';
export const BROWSER_ID_COOKIE = 'Browser_Id';

export type TestPerson = Awaited<ReturnType<typeof factories.person.create>> & {
	email: string;
	password: string;
};

type Fixtures = {
	/** a fresh person with a known password */
	person: TestPerson;
	/** logs the person in through the API, sharing the browser context's cookies */
	login: (person: TestPerson) => Promise<void>;
};

export const createPerson = async (password = 'password'): Promise<TestPerson> => {
	const person = await factories.person.create({ password });
	return { ...person, email: person.email!, password };
};

export const getAuthCookie = async (context: BrowserContext) => {
	const cookies = await context.cookies();
	return cookies.find(cookie => cookie.name === AUTH_COOKIE);
};

/** logs in through the login form, for tests that cover the form itself */
export const loginThroughForm = async (page: Page, person: TestPerson, password = person.password) => {
	await page.getByRole('textbox', { name: 'Email' }).fill(person.email);
	await page.getByRole('textbox', { name: 'Password' }).fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
};

export const test = base.extend<Fixtures>({
	// playwright requires the destructuring pattern, even when empty
	// oxlint-disable-next-line no-empty-pattern
	person: async ({}, use) => {
		await use(await createPerson());
	},

	login: async ({ page }, use) => {
		await use(async (person) => {
			const res = await page.request.post(`${API_URL}/v1/auth/login`, {
				data: { username: person.email, password: person.password },
			});
			expect(res.status(), 'login should succeed').toBe(200);
		});
	},
});

export { expect };
