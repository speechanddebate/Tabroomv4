<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { http, HttpResponse } from 'msw';
	import { expect, userEvent, within } from 'storybook/test';
	import type { UserProfile } from '@tabroom/types';
	import {
		getUserNotifyPushMockHandler,
		getUserProfileMockHandler,
		getUserProfileUpdateMockHandler,
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

	const serve = (profile: UserProfile, ...overrides: ReturnType<typeof http.patch>[]) => ({
		msw: {
			handlers: [
				...overrides,
				getUserProfileMockHandler(profile),
				getUserProfileUpdateMockHandler(profile),
				getUserNotifyPushMockHandler({ publicKey: 'BStoryKey', endpoint: null, disabled: false }),
			],
		},
	});
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

<Story name="Password change required" parameters={serve({ ...avery, forcePasswordChange: true })} />
