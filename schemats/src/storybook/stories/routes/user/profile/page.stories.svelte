<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { http, HttpResponse, type HttpHandler } from 'msw';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import type { UserProfile, UserSession } from '@tabroom/types';
	import {
		getUserNotifyPushMockHandler,
		getUserPasswordChangeMockHandler,
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
		emailCodeExpired    : false,
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

	const wrongPassword = {
		type     : 'about:blank',
		title    : 'You Do Not Have Access to This Resource',
		status   : 403,
		detail   : 'That password isn\'t right',
		issues   : [{ path: ['currentPassword'], message: 'That password isn\'t right', code: 'custom' }],
	};

	const serve = (profile: UserProfile, ...overrides: HttpHandler[]) => {
		// ending a login takes it off the list, and a password change ends every other login and any required change, as the API does
		let sessions = [...logins];
		let stored = profile;
		return {
			msw: {
				handlers: [
					...overrides,
					getUserProfileMockHandler(() => stored),
					getUserProfileUpdateMockHandler(profile),
					getUserNotifyPushMockHandler({ publicKey: 'BStoryKey', endpoint: null, disabled: false }),
					getUserSessionsMockHandler(() => sessions),
					getUserSessionEndMockHandler(({ params }) => {
						sessions = sessions.filter(session => session.id !== Number(params.sessionId));
					}),
					getUserPasswordChangeMockHandler(() => {
						sessions = sessions.filter(session => session.current);
						stored = { ...stored, forcePasswordChange: false };
					}),
				],
			},
		};
	};

	const changePassword = async (canvas: ReturnType<typeof within>) => {
		const form = within(await canvas.findByTestId('password-form'));
		await userEvent.type(form.getByLabelText(/^Current password/), 'old-password');
		await userEvent.type(form.getByLabelText(/^New password/), 'a new password');
		await userEvent.type(form.getByLabelText(/^Repeat new password/), 'a new password');
		await userEvent.click(form.getByRole('button', { name: 'Change password' }));
		return form;
	};

	const suSession = {
		Person : { id: 4410, first: 'Avery', last: 'Okafor', email: 'avery.okafor@example.org', tz: 'America/Chicago' },
		Su     : { id: 1, first: 'Morgan', last: 'Reyes', email: 'mreyes@speechanddebate.example', tz: 'America/Chicago', site_admin: 1 },
	};
</script>

<Story name="Default" parameters={serve(avery)} />

<Story name="Unconfirmed email" parameters={serve({ ...avery, emailUnconfirmed: true })} />

<Story
	name="Change email"
	parameters={serve(avery)}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const email = await canvas.findByRole('textbox', { name: 'Email' });
		// The password card has its own Current password field
		const emailGroup = within(canvas.getByTestId('profile-email'));

		await expect(emailGroup.queryByLabelText(/Current password/)).not.toBeInTheDocument();
		await userEvent.clear(email);
		await userEvent.type(email, 'avery.new@example.org');

		await expect(await emailGroup.findByLabelText(/Current password/)).toBeInTheDocument();
		await expect(canvas.getByText('1 unsaved change')).toBeInTheDocument();
	}}
/>

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

<Story
	name="Change password"
	parameters={serve(avery)}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const form = await changePassword(canvas);

		await waitFor(() => expect(canvas.queryByText('Chrome on Windows 10')).not.toBeInTheDocument());
		await expect(canvas.getByText('This browser')).toBeInTheDocument();
		await expect(form.getByLabelText(/^Current password/)).toHaveValue('');
	}}
/>

<Story
	name="Wrong current password"
	parameters={serve(avery, http.post('*/user/profile/password', () => HttpResponse.json(wrongPassword, { status: 403 })))}
	play={async ({ canvasElement }) => {
		const form = await changePassword(within(canvasElement));

		await expect(await form.findByText('That password isn\'t right')).toBeInTheDocument();
		await expect(form.getByLabelText(/^Current password/)).toHaveAttribute('aria-invalid', 'true');
	}}
/>

<Story name="Under su" parameters={{ ...serve(avery), session: suSession }} />

<Story name="Password change required" parameters={serve({ ...avery, forcePasswordChange: true })} />

<Story
	name="Password change required, then changed"
	parameters={serve({ ...avery, forcePasswordChange: true })}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Stories have no +page.ts prefetch, so the full page shows until the profile loads
		const forced = within(await canvas.findByTestId('forced-password-change'));
		await expect(canvas.queryByRole('textbox', { name: /First name/ })).not.toBeInTheDocument();

		await changePassword(forced);

		await expect(await canvas.findByRole('textbox', { name: /First name/ })).toHaveValue('Avery');
		await expect(canvas.queryByTestId('forced-password-change')).not.toBeInTheDocument();
	}}
/>
