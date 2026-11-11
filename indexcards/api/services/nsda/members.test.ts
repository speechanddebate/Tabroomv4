import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NSDAError } from './fetchNSDA.js';
import { getMember, getMemberByEmail } from './members.js';

// The real NSDAError; only the request itself is faked
const { fetchNSDA } = vi.hoisted(() => ({ fetchNSDA: vi.fn() }));
vi.mock('./fetchNSDA.js', async (importOriginal) => ({
	...await importOriginal<typeof import('./fetchNSDA.js')>(),
	fetchNSDA,
}));

describe('getMember', () => {
	beforeEach(() => {
		fetchNSDA.mockReset();
	});

	it('asks for the member by id and returns who they are, leaving the rest of the record out', async () => {
		fetchNSDA.mockResolvedValue({
			person_id: 5001, first: 'Dana', middle: null, last: 'Reyes', email: 'dana@school.org', disabled: false,
			points: 412, degree_id: 6, degree_name: 'Special Distinction', active: true, degrees: [{ honor_id: 6 }], honors: [], citations: [],
		});

		await expect(getMember(5001)).resolves.toEqual({ person_id: 5001, first: 'Dana', middle: null, last: 'Reyes', email: 'dana@school.org' });
		expect(fetchNSDA).toHaveBeenCalledExactlyOnceWith('/members/5001');
	});

	it('returns null for an id the NSDA does not have, which the API answers with an object that has no member in it', async () => {
		fetchNSDA.mockResolvedValue({ disabled: false, deceased: false, addresses: [], points: 0, degrees: [], honors: [], citations: [], districts_eligible: false });

		await expect(getMember(999999999)).resolves.toBeNull();
	});

	it('passes on the reason a request failed', async () => {
		fetchNSDA.mockRejectedValue(new NSDAError('The NSDA API did not answer GET /members/5001 within 60 seconds'));

		await expect(getMember(5001)).rejects.toThrow('did not answer GET /members/5001');
	});
});

describe('getMemberByEmail', () => {
	// A search line as the API sends it for a member with one role
	const result = (id: number) => ({
		id, first: 'Dana', last: 'Reyes', realm: 'hs', role: 'Coach', school_id: 4411, status: 1, start: '2024-08-01', end: null,
		school_name: 'Lakeside High School', school_state: 'TX', type: 'member', name: 'Dana Reyes', description: `Dana Reyes (${id}) - Coach at Lakeside High School`,
	});

	beforeEach(() => {
		fetchNSDA.mockReset();
	});

	it('searches members for the email, encoded, and returns who the first result is', async () => {
		fetchNSDA.mockResolvedValue([result(5001), result(5001), result(5002)]);

		await expect(getMemberByEmail('dana+debate@school.org')).resolves.toEqual({ id: 5001, first: 'Dana', last: 'Reyes', name: 'Dana Reyes' });
		expect(fetchNSDA).toHaveBeenCalledExactlyOnceWith('/search?q=dana%2Bdebate%40school.org&type=members');
	});

	it('returns null when nobody has that email', async () => {
		fetchNSDA.mockResolvedValue([]);

		await expect(getMemberByEmail('nobody@school.org')).resolves.toBeNull();
	});

	it('passes on the reason a request failed, and throws when the answer is not a list', async () => {
		fetchNSDA.mockRejectedValueOnce(new NSDAError('The NSDA API answered GET /search with 403 Forbidden', { status: 403 }));
		await expect(getMemberByEmail('dana@school.org')).rejects.toThrow('The NSDA API answered GET /search with 403 Forbidden');

		fetchNSDA.mockResolvedValue({ message: 'Bad search query' });
		await expect(getMemberByEmail('dana@school.org')).rejects.toThrow('NSDA member search did not return a list');
	});
});
