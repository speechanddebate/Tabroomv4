
import factories from '../../tests/factories/index.js';
import { encrypt } from 'unixcrypt';
import { ValidationError } from '../helpers/errors/errors.js';
vi.mock('../repos/personRepo.js', () => ({
	default: {
		getPersonByUsername: vi.fn(),
		createPerson: vi.fn(),
	},
}));

vi.mock('../repos/sessionRepo.js', () => ({
	default: {
		createSession: vi.fn(),
	},
}));

import AuthService,{ AUTH_INVALID }  from './AuthService.js';
import personRepo from '../repos/personRepo.js';
import sessionRepo from '../repos/sessionRepo.js';

type MockPerson = Awaited<ReturnType<typeof personRepo.getPersonByUsername>>;

describe('AuthService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('login', () => {
		it('authenticates a user with valid credentials', async () => {
			const password = 'mypassword';
			const email = 'login@example.com';
			const person = {
				id: 1,
				...factories.person.createPersonData({
					email,
				password: encrypt(password),
				}),
			} as MockPerson;

			vi.mocked(personRepo.getPersonByUsername).mockResolvedValue(person);

			vi.mocked(sessionRepo.createSession).mockResolvedValue({ id: 1, userkey: 'mocktoken' });

			//Act
			const result = await AuthService.login(email, password);

			expect(result.token).toBe('mocktoken');
			expect(result.person?.id).toBe(person?.id);
		});
		it('throws AUTH_INVALID when user is not found', async () => {

			vi.mocked(personRepo.getPersonByUsername).mockResolvedValue(undefined);

			vi.mocked(sessionRepo.createSession).mockResolvedValue({ id: 1, userkey: 'mocktoken' });

			//Act
			await expect(AuthService.login('username', 'password')).rejects.toBe(AUTH_INVALID);
		});
		it('throws AUTH_INVALID for invalid credentials', async () => {
			const password = 'mypassword';
			const email = 'wrongpass@example.com';
			const person = {
				id: 1,
				...factories.person.createPersonData({
					email,
				password: encrypt(password),
				}),
			} as MockPerson;

			vi.mocked(personRepo.getPersonByUsername).mockResolvedValue(person);

			await expect(AuthService.login(email, 'wrongpassword')).rejects.toBe(AUTH_INVALID);
		});
	});

	describe('register', () => {
		it('registers a new user', async () => {
			const personData = factories.person.createPersonData({
				email: 'test@example.com',
			});
			const userData = {
				email: personData.email ?? 'test@example.com',
				password: 'securepassword',
				first: personData.first ?? 'Test',
				last: personData.last ?? 'User',
			};

			vi.mocked(personRepo.getPersonByUsername).mockResolvedValue(undefined);

			vi.mocked(personRepo.createPerson).mockResolvedValue(1);

			vi.mocked(sessionRepo.createSession).mockResolvedValue({
				id: 1,
				userkey: 'mocktoken',
			});

			const result = await AuthService.register(userData);

			expect(result).toHaveProperty('personId');
			expect(result).toHaveProperty('token');
		});
		it('throws ValidationError if email is already in use', async () => {
			const email = 'existing@example.com';
			const existingPerson = {
				id: 1,
				...factories.person.createPersonData({ email }),
				email,
			} as MockPerson;

			vi.mocked(personRepo.getPersonByUsername).mockResolvedValue(
				existingPerson,
			);

			await expect(AuthService.register({
				email,
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

	describe('generateCSRFToken', () => {
		it('generates a valid CSRF token as a hex string', () => {
			const userkey = 'testkey';
			const token = AuthService.generateCSRFToken(userkey);
			expect(typeof token).toBe('string');
			expect(token.length).toBe(64); // sha256 hex digest length
		});
	});

	describe('getCookieOptions', () => {
		it('returns Auth Cookie Options', () => {
			const opts = AuthService.getAuthCookieOptions();
			expect(opts).toBeDefined();
		});
		it('returns CSRF Cookie Options', () => {
			const opts = AuthService.getCSRFCookieOptions();
			expect(opts).toBeDefined();
		});
	});
});
