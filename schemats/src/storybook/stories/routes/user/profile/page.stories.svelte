<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { http, HttpResponse } from 'msw';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import type { UserProfile, UserSession } from '@tabroom/types';
	import {
		getUserNotifyPushMockHandler,
		getUserProfileMockHandler,
		getUserProfileUpdateMockHandler,
		getUserSessionEndMockHandler,
		getUserSessionsMockHandler,
	} from '$indexcards/index.msw';
	import ProfilePage from '../../../../../routes/user/profile/+page.svelte';

	const { Story } = defineMeta({
		title: 'Routes/User/Profile',
		component: ProfilePage,
		parameters: { layout: 'fullscreen' },
	});

	const avery: UserProfile = {
		email               : 'avery.okafor@example.org',
		first               : 'Avery',
		middle              : null,
		last                : 'Okafor',
		pronoun             : 'they/them',
		phone               : '5155550142',
		tz                  : 'America/Chicago',
		street              : '1415 Locust St',
		city                : 'Des Moines',
		state               : 'IA',
		country             : 'US',
		zip                 : '50309',
		postal              : null,
		noEmail             : false,
		emailUnconfirmed    : false,
		forcePasswordChange : false,
	};

	const zipProblem = {
		type     : 'about:blank',
		title    : 'Request Validation Failed',
		status   : 400,
		detail   : 'Some fields need attention',
		issues   : [{ path: ['zip'], message: 'Use a 5-digit ZIP code, or ZIP+4', code: 'invalid_format' }],
	};

	const login = (session: Partial<UserSession> & Pick<UserSession, 'id' | 'last_access'>): UserSession => ({
		current    : false,
		subscribed : false,
		disabled   : false,
		host       : null,
		browser    : null,
		os         : null,
		ip         : null,
		created_at : session.last_access,
		...session,
	});

	const logins = [
		login({ id: 4101, current: true, browser: 'Firefox', os: 'Linux', ip: '198.51.100.24', last_access: '2026-11-16T14:02:00.000Z' }),
		login({ id: 4097, browser: 'Safari', os: 'iOS 18.1', ip: '203.0.113.57', last_access: '2026-11-15T23:41:00.000Z', subscribed: true, host: 'web.push.apple.com' }),
		login({ id: 3980, browser: 'Chrome', os: 'Windows 10', ip: '192.0.2.181', last_access: '2026-10-28T13:15:00.000Z' }),
		login({ id: 3512, ip: '2001:db8:85a3::8a2e:370:7334', last_access: '2026-09-02T17:30:00.000Z' }),
	];

	const serve = (profile: UserProfile, ...overrides: ReturnType<typeof http.patch>[]) => {
		// ending a login takes it off the list, as the API does
		let sessions = [...logins];
		return {
			msw: {
				handlers: [
					...overrides,
					getUserProfileMockHandler(profile),
					getUserProfileUpdateMockHandler(profile),
					getUserNotifyPushMockHandler({ publicKey: 'BStoryKey', endpoint: null, disabled: false }),
					getUserSessionsMockHandler(() => sessions),
					getUserSessionEndMockHandler(({ params }) => {
						sessions = sessions.filter(session => session.id !== Number(params.sessionId));
					}),
				],
			},
		};
	};
</script>

<Story name="Default" parameters={serve(avery)} />

<Story name="Unconfirmed email" parameters={serve({ ...avery, emailUnconfirmed: true })} />

<Story name="Stored legacy values" parameters={serve({ ...avery, state: 'DE-M', country: 'DE', zip: null, postal: '10115', tz: 'CET' })} />

<Story
	name="Validation errors"
	parameters={serve(avery, http.patch('*/user/profile', () => HttpResponse.json(zipProblem, { status: 400 })))}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const zip = await canvas.findByRole('textbox', { name: 'ZIP code' });

		await userEvent.clear(zip);
		await userEvent.type(zip, '5030');
		await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }));

		await expect(await canvas.findByText('Use a 5-digit ZIP code, or ZIP+4')).toBeInTheDocument();
		await expect(zip).toHaveAttribute('aria-invalid', 'true');
		await expect(canvas.getByText('1 unsaved change')).toBeInTheDocument();
	}}
/>

<Story
	name="End a session"
	parameters={serve(avery)}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const end = await canvas.findByRole('button', { name: 'End session on Chrome on Windows 10' });

		await userEvent.click(end);

		await waitFor(() => expect(canvas.queryByText('Chrome on Windows 10')).not.toBeInTheDocument());
		await expect(canvas.getByText('Safari on iOS 18.1')).toBeInTheDocument();
	}}
/>

<Story name="Password change required" parameters={serve({ ...avery, forcePasswordChange: true })} />
