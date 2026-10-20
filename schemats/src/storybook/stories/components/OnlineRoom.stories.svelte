<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, spyOn, userEvent, waitFor, within } from 'storybook/test';
	import { HttpResponse, http } from 'msw';
	import type { OnlineRoom } from '@tabroom/types';
	import {
		getRestTournsRoomJoinMockHandler,
		getRestTournsSectionsRoomGetMockHandler,
		getRestTournsSectionsRoomJoinMockHandler,
	} from '$indexcards/index.msw';
	import OnlineRoomComponent from '$lib/components/OnlineRoom.svelte';

	// The join button for an online room
	const { Story } = defineMeta({
		title: 'Components/OnlineRoom',
		component: OnlineRoomComponent,
		args: {
			target: { type: 'section', tournId: 1, sectionId: 2 },
			variant: 'icon',
		},
		argTypes: {
			variant: { control: 'select', options: ['icon', 'text'] },
		},
	});

	const sectionRoom = (overrides: Partial<OnlineRoom> = {}): OnlineRoom => ({
		name: 'PF A',
		joinable: true,
		hybrid: false,
		mapUrl: null,
		...overrides,
	});

	// Stands in for the window a join opens, so the story doesn't leave the page
	function stubWindow() {
		const win = { location: { href: '' }, opener: {}, close: fn() };
		const open = spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		return { win, open };
	}
</script>

<Story
	name="Sync Room"
	parameters={{
		msw: {
			handlers: [
				getRestTournsSectionsRoomGetMockHandler(sectionRoom({ name: 'Room 101' })),
				getRestTournsSectionsRoomJoinMockHandler({ url: 'https://zoom.test/room', token: null, password: 'roompass' }),
			],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const { win, open } = stubWindow();

		await userEvent.click(await canvas.findByRole('button', { name: 'Join Room 101' }));

		await waitFor(() => expect(win.location.href).toBe('https://zoom.test/room'));
		await expect(win.opener).toBeNull();
		open.mockRestore();
	}}
/>

<Story
	name="Text Button"
	args={{ variant: 'text' }}
	parameters={{
		msw: {
			handlers: [
				getRestTournsSectionsRoomGetMockHandler(sectionRoom({ name: 'Room 101' })),
				getRestTournsSectionsRoomJoinMockHandler({ url: 'https://zoom.test/room', token: null, password: null }),
			],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const { win, open } = stubWindow();

		const button = await canvas.findByRole('button', { name: 'Join Room 101' });
		await expect(button).toHaveTextContent('Join Room 101');

		await userEvent.click(button);

		await waitFor(() => expect(win.location.href).toBe('https://zoom.test/room'));
		open.mockRestore();
	}}
/>

<Story
	name="Campus Room"
	parameters={{
		msw: {
			handlers: [
				getRestTournsSectionsRoomGetMockHandler(sectionRoom()),
				getRestTournsSectionsRoomJoinMockHandler({ url: 'https://campus.test', token: 'signed.campus.token', password: null }),
			],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const { open } = stubWindow();
		const submit = spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});

		await userEvent.click(await canvas.findByRole('button', { name: 'Join PF A' }));

		await waitFor(() => expect(submit).toHaveBeenCalled());
		const form = canvasElement.querySelector('form');
		await expect(form).toHaveAttribute('action', 'https://campus.test');
		await expect(form).toHaveAttribute('method', 'post');
		await expect(form?.querySelector('input[name="json"]')).toHaveValue('signed.campus.token');
		submit.mockRestore();
		open.mockRestore();
	}}
/>

<Story
	name="Campus Unavailable"
	parameters={{
		msw: {
			handlers: [
				getRestTournsSectionsRoomGetMockHandler(sectionRoom()),
				http.post('*/rest/tourns/:tournId/sections/:sectionId/room/join', () => HttpResponse.json(
					{ type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'NSDA Campus rooms are unavailable right now' },
					{ status: 503 },
				)),
			],
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const { win, open } = stubWindow();

		await userEvent.click(await canvas.findByRole('button', { name: 'Join PF A' }));

		await waitFor(() => expect(win.close).toHaveBeenCalled());
		open.mockRestore();
	}}
/>

<Story
	name="Utility Room"
	args={{
		target: { type: 'utility', tournId: 1, room: { id: 3, name: 'Judge Lounge', joinable: true, hybrid: false, mapUrl: null } },
	}}
	parameters={{
		msw: { handlers: [getRestTournsRoomJoinMockHandler({ url: 'https://zoom.test/lounge', token: null, password: null })] },
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const { win, open } = stubWindow();

		await userEvent.click(canvas.getByRole('button', { name: 'Join Judge Lounge' }));

		await waitFor(() => expect(win.location.href).toBe('https://zoom.test/lounge'));
		open.mockRestore();
	}}
/>
