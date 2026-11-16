import type { Problem } from '@tabroom/types';
import { fieldErrors } from './forms';

const problem = (issues?: Problem['issues']): Problem => ({
	type: 'about:blank',
	title: 'Request Validation Failed',
	status: 400,
	issues,
});

describe('fieldErrors', () => {
	it('returns no errors without a problem or issues', () => {
		expect(fieldErrors(null)).toEqual({});
		expect(fieldErrors(undefined)).toEqual({});
		expect(fieldErrors(problem())).toEqual({});
	});

	it('keys each issue by its field', () => {
		expect(fieldErrors(problem([
			{ path: ['first'], code: 'too_small', message: 'Enter a first name' },
			{ path: ['phone'], code: 'custom', message: 'That phone number is in use' },
		]))).toEqual({
			first: 'Enter a first name',
			phone: 'That phone number is in use',
		});
	});

	it('joins nested paths with dots', () => {
		expect(fieldErrors(problem([
			{ path: ['address', 'zip'], code: 'custom', message: 'Enter a 5-digit ZIP code' },
			{ path: ['schools', 0, 'name'], code: 'custom', message: 'Enter a name' },
		]))).toEqual({
			'address.zip': 'Enter a 5-digit ZIP code',
			'schools.0.name': 'Enter a name',
		});
	});

	it('keeps the first message when a field has several', () => {
		expect(fieldErrors(problem([
			{ path: ['last'], code: 'too_small', message: 'Enter a last name' },
			{ path: ['last'], code: 'invalid_format', message: 'Names can\'t contain digits' },
		]))).toEqual({ last: 'Enter a last name' });
	});

	it('leaves out issues about the whole request', () => {
		expect(fieldErrors(problem([
			{ path: [], code: 'invalid_type', message: 'Expected an object' },
		]))).toEqual({});
	});
});
