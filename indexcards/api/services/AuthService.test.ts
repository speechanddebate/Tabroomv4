
import factories from '../../tests/factories/index.js';
import { ValidationError } from '../helpers/errors/errors.js';

import AuthService,{ AUTH_INVALID }  from './AuthService.js';

describe('AuthService', () => {

	describe('login', () => {
		it('authenticates a user with valid credentials', async () => {
			const password = 'mypassword';
			const Person = await factories.person.create({
				password: password,
			});

			//Act
			const result = await AuthService.login(Person.email!, password);

			expect(result.token).toBeDefined();
			expect(result.person?.id).toBe(Person.id);
		});
		it('throws AUTH_INVALID when user is not found', async () => {
			//Act
			await expect(AuthService.login('username', 'password')).rejects.toBe(AUTH_INVALID);
		});
		it('throws AUTH_INVALID for invalid credentials', async () => {
			const password = 'mypassword';
			const Person = await factories.person.create({
				password: password,
			});

			await expect(AuthService.login(Person.email!, 'wrongpassword')).rejects.toBe(AUTH_INVALID);
		});
	});

	describe('register', () => {
		it('registers a new user', async () => {
			const personData = factories.person.createPersonData();
			const userData = {
				email: personData.email!,
				password: 'securepassword',
				first: personData.first ?? 'Test',
				last: personData.last ?? 'User',
			};

			const result = await AuthService.register(userData);

			expect(result).toHaveProperty('personId');
			expect(result).toHaveProperty('token');
		});
		it('throws ValidationError if email is already in use', async () => {
			const existingPerson = await factories.person.create();	

			await expect(AuthService.register({
				email:existingPerson.email,
				password: 'anotherpassword',
				first: 'Test',
				last: 'User',
			})).rejects.toThrow(ValidationError);
		});
		it('throws ValidationError if password is missing', async () => {
			const userData = {
				email: 'test@example.com',
			};

			await expect(
				AuthService.register(userData as Parameters<typeof AuthService.register>[0]),
			).rejects.toThrow(ValidationError);
		});
	});

	describe('getCookieOptions', () => {
		it('returns Auth Cookie Options', () => {
			const opts = AuthService.getAuthCookieOptions();
			expect(opts).toBeDefined();
		});
	});
});
