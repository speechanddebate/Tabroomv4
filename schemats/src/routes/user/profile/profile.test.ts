import type { UserProfile } from '@tabroom/types';
import { countryOptions, profileForm, showsZip, timeZoneOptions } from './profile';

const profile: UserProfile = {
	email               : 'avery@example.org',
	first               : 'Avery',
	middle              : null,
	last                : 'Okafor',
	pronoun             : null,
	phone               : null,
	tz                  : null,
	street              : null,
	city                : 'Des Moines',
	state               : 'IA',
	country             : 'US',
	zip                 : '50309',
	postal              : null,
	noEmail             : false,
	emailUnconfirmed    : false,
	emailCodeExpired    : false,
	forcePasswordChange : false,
};

describe('profileForm', () => {
	it('turns unset columns into empty strings and leaves out what the form doesn\'t edit', () => {
		expect(profileForm(profile)).toEqual({
			first: 'Avery', middle: '', last: 'Okafor', pronoun: '', phone: '', street: '', city: 'Des Moines',
			state: 'IA', country: 'US', zip: '50309', postal: '', tz: '', noEmail: false, email: profile.email,
		});
	});
});

describe('showsZip', () => {
	it.each([
		['US', true],
		['CA', false],
		['GB', false],
		['', false],
	])('%j shows a ZIP code: %s', (country, expected) => {
		expect(showsZip(country)).toBe(expected);
	});
});

describe('countryOptions', () => {
	it('starts with None, then every country by name', () => {
		const options = countryOptions();

		expect(options[0]).toEqual({ value: '', label: 'None' });
		expect(options).toContainEqual({ value: 'GB', label: 'United Kingdom' });
		const names = options.slice(1).map(option => option.label);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});
});

describe('timeZoneOptions', () => {
	it('puts America first, led by the US zones in classic\'s order and labels', () => {
		const [america] = timeZoneOptions('');

		expect(america!.label).toBe('America');
		expect(america!.options.slice(0, 6)).toEqual([
			{ value: 'America/New_York', label: 'New York - EST or EDT' },
			{ value: 'America/Chicago', label: 'Chicago - CST or CDT' },
			{ value: 'America/Denver', label: 'Denver - MST or MDT' },
			{ value: 'America/Phoenix', label: 'Phoenix - MST' },
			{ value: 'America/Los_Angeles', label: 'Los Angeles - PST or PDT' },
			{ value: 'America/Anchorage', label: 'Anchorage - AKST or AKDT' },
		]);
	});

	it('sorts the other regions by name, with Honolulu leading Pacific', () => {
		const groups = timeZoneOptions('');
		const regions = groups.slice(1, -1).map(group => group.label);

		expect(regions).toEqual([...regions].sort());
		expect(groups.find(group => group.label === 'Pacific')!.options[0]).toEqual({ value: 'Pacific/Honolulu', label: 'Honolulu - HST' });
	});

	it('lists each zone once', () => {
		const values = timeZoneOptions('').flatMap(group => group.options.map(option => option.value));

		expect(new Set(values).size).toBe(values.length);
	});

	it.each([['CET'], ['US/Eastern']])('keeps a stored legacy zone %s under Other', (stored) => {
		expect(timeZoneOptions(stored).at(-1)).toEqual({
			label: 'Other',
			options: [{ value: 'UTC', label: 'UTC' }, { value: stored, label: stored }],
		});
	});

	it.each([[''], ['UTC'], ['America/Chicago']])('offers only UTC under Other for %j', (stored) => {
		expect(timeZoneOptions(stored).at(-1)!.options).toEqual([{ value: 'UTC', label: 'UTC' }]);
	});
});
