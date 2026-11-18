/** ISO 3166-1 alpha-2 codes. Display names come from Intl.DisplayNames where they are shown. */
export const COUNTRY_CODES = [
	'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
	'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
	'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
	'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
	'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
	'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
	'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
	'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
	'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
	'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
	'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
	'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
	'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
	'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
	'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
	'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

export type StateGroup = { label: string, options: { value: string, label: string }[] };

/**
 * Classic's state list. Codes repeat across groups (WA, NT), so a stored code shows under
 * its first group. Classic's Deutschland group is left out: its DE-BW style codes don't fit
 * person.state char(4), and classic truncates them on save.
 */
export const STATE_GROUPS: StateGroup[] = ([
	{
		label: 'United States',
		options: [
			['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
			['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'Dist. of Columbia'],
			['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
			['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
			['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
			['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
			['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
			['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
			['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
			['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
			['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
			['AS', 'American Samoa'], ['GU', 'Guam'], ['MH', 'Marshall Islands'], ['FM', 'Micronesia'],
			['MP', 'Northern Marianas'], ['PW', 'Palau'], ['PR', 'Puerto Rico'], ['VI', 'Virgin Islands'],
		],
	},
	{
		label: 'United Kingdom',
		options: [['EN', 'England'], ['SL', 'Scotland'], ['WL', 'Wales'], ['NI', 'Northern Ireland']],
	},
	{
		label: 'Canada',
		options: [
			['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
			['NL', 'Newfoundland & Labrador'], ['NT', 'Northwest Territories'], ['NS', 'Nova Scotia'],
			['NU', 'Nunavut'], ['PE', 'Prince Edward Island'], ['SK', 'Saskatchewan'], ['ON', 'Ontario'],
			['QC', 'Quebec'], ['YT', 'Yukon'],
		],
	},
	{
		label: 'Australia',
		// Classic's option for Western Australia is "WA " with a trailing space; char(4) stores it as WA
		options: [
			['VIC', 'Victoria'], ['NSW', 'New South Wales'], ['QLD', 'Queensland'], ['TAS', 'Tasmania'],
			['NT', 'Northern Territory'], ['ACT', 'Australian Capital Territory'], ['WA', 'Western Australia'],
			['SA', 'South Australia'],
		],
	},
	{ label: 'Other', options: [['', 'N/A - None']] },
] satisfies { label: string, options: [string, string][] }[]).map(group => ({
	label: group.label,
	options: group.options.map(([value, label]) => ({ value, label })),
}));

export const STATE_CODES: ReadonlySet<string> = new Set(
	STATE_GROUPS.flatMap(group => group.options.map(option => option.value)).filter(Boolean),
);

/** Any zone Intl accepts, which includes legacy names still stored on people (UTC, CET, US/Eastern) */
export function isValidTimeZone(zone: string) {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}
