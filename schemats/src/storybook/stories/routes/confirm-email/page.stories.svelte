<script lang="ts" module>
	import type { ComponentProps } from 'svelte';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { http, HttpResponse } from 'msw';
	import { expect, userEvent, within } from 'storybook/test';
	import { getRestEmailConfirmMockHandler, getRestEmailConfirmStatusMockHandler } from '$indexcards/index.msw';
	import ConfirmEmailPage from '../../../../routes/confirm-email/[token]/+page.svelte';

	const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.storybook-token';

	const { Story } = defineMeta({
		title: 'Routes/Confirm email link',
		component: ConfirmEmailPage,
		parameters: { layout: 'fullscreen' },
		args: { data: { token } as ComponentProps<typeof ConfirmEmailPage>['data'] },
	});

	const email = 'a***@example.org';

	const serve = (confirmed: boolean) => ({
		msw: {
			handlers: [
				getRestEmailConfirmStatusMockHandler({ email, confirmed }),
				getRestEmailConfirmMockHandler({ confirmed: true, email }),
			],
		},
	});

	const refused = (status: 404 | 410, title: string) => ({
		msw: {
			handlers: [
				http.get('*/rest/email/confirm/:token', () => HttpResponse.json({ type: 'about:blank', title, status, detail: title }, { status })),
			],
		},
	});

	const heading = async (canvasElement: HTMLElement, name: string) =>
		expect(await within(canvasElement).findByRole('heading', { name })).toBeInTheDocument();
</script>

<Story
	name="Ready"
	parameters={serve(false)}
	play={async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole('button', { name: 'Confirm my email address' })).toBeEnabled();
	}}
/>

<Story
	name="Confirm"
	parameters={serve(false)}
	play={async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Confirm my email address' }));
		await heading(canvasElement, 'Your email is confirmed');
	}}
/>

<Story name="Already confirmed" parameters={serve(true)} play={({ canvasElement }) => heading(canvasElement, 'Your email is confirmed')} />

<Story name="Expired" parameters={refused(410, 'This is no longer available.')} play={({ canvasElement }) => heading(canvasElement, 'This link has expired')} />

<Story name="Replaced" parameters={refused(404, 'The specified resource was not found.')} play={({ canvasElement }) => heading(canvasElement, 'This link no longer works')} />
