import type { UserProfile, UserProfileUpdate } from '@tabroom/types';
import { COUNTRY_CODES } from '@tabroom/types/constants';
import type { SelectGroup, SelectOption } from '$lib/components/forms';

// The current password is asked for only with an email change and never kept, so it isn't part of the form's values
export type ProfileForm = Required<Omit<UserProfileUpdate, 'country' | 'currentPassword'>> & { country: string };

/** The form's values: every field a string, so an unset column and an emptied field compare equal */
export function profileForm(profile: UserProfile): ProfileForm {
	return {
		first   : profile.first,
		middle  : profile.middle ?? '',
		last    : profile.last,
		pronoun : profile.pronoun ?? '',
		phone   : profile.phone ?? '',
		street  : profile.street ?? '',
		city    : profile.city ?? '',
		state   : profile.state ?? '',
		country : profile.country ?? '',
		zip     : profile.zip ?? '',
		postal  : profile.postal ?? '',
		tz      : profile.tz ?? '',
		noEmail : profile.noEmail,
		email   : profile.email,
	};
}

/** A US address takes a ZIP code; every other country a postal code */
export const showsZip = (country: string) => country === 'US';

export function countryOptions(): SelectOption[] {
	const names = new Intl.DisplayNames(['en'], { type: 'region' });
	return [
		{ value: '', label: 'None' },
		...COUNTRY_CODES
			.map(code => ({ value: code, label: names.of(code) ?? code }))
			.sort((a, b) => a.label.localeCompare(b.label)),
	];
}

// Classic's labels for the US zones, which lead the America group in this order
const US_ZONES: Record<string, string> = {
	'America/New_York'    : 'EST or EDT',
	'America/Chicago'     : 'CST or CDT',
	'America/Denver'      : 'MST or MDT',
	'America/Phoenix'     : 'MST',
	'America/Los_Angeles' : 'PST or PDT',
	'America/Anchorage'   : 'AKST or AKDT',
	'Pacific/Honolulu'    : 'HST',
};

/**
 * Every zone Intl knows, grouped by region as classic does: America first, the rest by name, and
 * the US zones leading their region (Honolulu leads Pacific). UTC and a
 * stored zone missing from Intl's list (legacy names such as CET or US/Eastern) go under Other.
 */
export function timeZoneOptions(stored: string): SelectGroup[] {
	const zones = Intl.supportedValuesOf('timeZone');
	const groups = new Map<string, SelectOption[]>();

	for (const zone of [...Object.keys(US_ZONES), ...zones.filter(zone => !(zone in US_ZONES))]) {
		const [region = zone, ...place] = zone.split('/');
		const city = place.join('/').replaceAll('_', ' ');
		const label = US_ZONES[zone] ? `${city} - ${US_ZONES[zone]}` : city;
		groups.set(region, [...(groups.get(region) ?? []), { value: zone, label }]);
	}

	const other = ['UTC', ...(stored && stored !== 'UTC' && !zones.includes(stored) ? [stored] : [])];

	return [
		...[...groups]
			.sort(([a], [b]) => (a === 'America' ? -1 : b === 'America' ? 1 : a.localeCompare(b)))
			.map(([label, options]) => ({ label, options })),
		{ label: 'Other', options: other.map(zone => ({ value: zone, label: zone })) },
	];
}
