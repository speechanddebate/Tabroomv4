<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { http, HttpResponse } from 'msw';
	import { expect, userEvent, within } from 'storybook/test';
	import type { UserProfile } from '@tabroom/types';
	import {
		getUserEmailConfirmMockHandler,
		getUserEmailResendMockHandler,
		getUserProfileMockHandler,
	} from '$indexcards/index.msw';
	import ConfirmPage from '../../../../../../routes/user/profile/confirm/+page.svelte';

	const { Story } = defineMeta({
		title: 'Routes/User/Profile/Confirm email',
		component: ConfirmPage,
		parameters: { layout: 'fullscreen' },
	});

	const avery: UserProfile = {
		email               : 'avery.okafor@example.org',
		first               : 'Avery',
		middle              : null,
		last                : 'Okafor',
		pronoun             : 'they/them',
		phone               : null,
		tz                  : 'America/Chicago',
		street              : null,
		city                : 'Des Moines',
		state               : 'IA',
		country             : 'US',
		zip                 : '50309',
		postal              : null,
		noEmail             : true,
		emailUnconfirmed    : true,
		emailCodeExpired    : false,
		forcePasswordChange : false,
	};

	const wrongCode = {
		type   : 'about:blank',
		title  : 'Request Validation Failed',
		status : 400,
		detail : 'That code isn\'t right',
		issues : [{ path: ['code'], message: 'That code isn\'t right. Check the most recent email we sent.', code: 'custom' }],
	};

	const expiredCode = {
		type   : 'about:blank',
		title  : 'This is no longer available.',
		status : 410,
		detail : 'Your code has expired. Send a new one.',
	};

	const serve = (profile: UserProfile, ...overrides: ReturnType<typeof http.post>[]) => ({
		msw: {
			handlers: [
				...overrides,
				getUserProfileMockHandler(profile),
				getUserEmailConfirmMockHandler(),
				getUserEmailResendMockHandler(),
			],
		},
	});

	const enter = async (canvasElement: HTMLElement, code: string) => {
		const canvas = within(canvasElement);
		await userEvent.type(await canvas.findByRole('textbox', { name: /Confirmation code/ }), code);
		await userEvent.click(canvas.getByRole('button', { name: 'Confirm' }));
		return canvas;
	};
</script>

<Story name="Enter code" parameters={serve(avery)} />

<Story
	name="Code expired before arrival"
	parameters={serve({ ...avery, emailCodeExpired: true })}
	play={async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole('textbox', { name: /Confirmation code/ })).toBeInTheDocument();
	}}
/>

<Story
	name="Wrong code"
	parameters={serve(avery, http.post('*/user/profile/email/confirm', () => HttpResponse.json(wrongCode, { status: 400 })))}
	play={async ({ canvasElement }) => {
		const canvas = await enter(canvasElement, 'WRONG2');
		await expect(await canvas.findByText(/That code isn't right/)).toBeInTheDocument();
	}}
/>

<Story
	name="Expired code"
	parameters={serve(avery, http.post('*/user/profile/email/confirm', () => HttpResponse.json(expiredCode, { status: 410 })))}
	play={async ({ canvasElement }) => {
		const canvas = await enter(canvasElement, 'HXK3QY');
		await expect(await canvas.findByText(/Your code has expired/)).toBeInTheDocument();
	}}
/>

<Story
	name="Already confirmed"
	parameters={serve({ ...avery, emailUnconfirmed: false, noEmail: false })}
	play={async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByTestId('email-confirmed')).toBeInTheDocument();
	}}
/>
