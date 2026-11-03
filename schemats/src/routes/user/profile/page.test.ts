import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import ProfilePage from './+page.svelte';
import type { PushState } from '$lib/helpers/pushState.svelte';

const mocks = vi.hoisted(() => ({
	push: {
		state: null as PushState | null,
		busy: false,
		readPermission: vi.fn(),
		enable: vi.fn(),
		turnOff: vi.fn(),
		sendTest: vi.fn(),
	},
}));

vi.mock('$app/env/public', () => ({ CLASSIC_URL: 'https://www.tabroom.com' }));

vi.mock('$lib/helpers/pushState.svelte', () => ({
	createPushState: () => mocks.push,
}));

const pushToggle = () => screen.getByRole('checkbox', { name: 'Receive notifications on this browser' });

describe('Profile page', () => {
	beforeEach(() => {
		mocks.push.state = 'undecided';
		mocks.push.busy = false;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('links to the classic profile for everything else', () => {
		render(ProfilePage);

		expect(screen.getByRole('link', { name: 'Edit your profile' }))
			.toHaveAttribute('href', 'https://www.tabroom.com/user/login/profile.mhtml');
	});

	it('reads the browser permission on mount', () => {
		render(ProfilePage);

		expect(mocks.push.readPermission).toHaveBeenCalled();
	});

	it.each([
		['undecided'],
		['off'],
	] as const)('turns notifications on from the toggle when %s', async (state) => {
		mocks.push.state = state;
		const user = userEvent.setup();
		render(ProfilePage);

		expect(pushToggle()).not.toBeChecked();
		await user.click(pushToggle());

		expect(mocks.push.enable).toHaveBeenCalled();
		expect(mocks.push.turnOff).not.toHaveBeenCalled();
	});

	it('turns notifications off from the toggle when on', async () => {
		mocks.push.state = 'on';
		const user = userEvent.setup();
		render(ProfilePage);

		expect(pushToggle()).toBeChecked();
		await user.click(pushToggle());

		expect(mocks.push.turnOff).toHaveBeenCalled();
		expect(mocks.push.enable).not.toHaveBeenCalled();
	});

	it('sends a test notification when on', async () => {
		mocks.push.state = 'on';
		const user = userEvent.setup();
		render(ProfilePage);

		await user.click(screen.getByRole('button', { name: 'Send test notification' }));

		expect(mocks.push.sendTest).toHaveBeenCalled();
	});

	it.each([
		['undecided'],
		['off'],
		['denied'],
		['su'],
	] as const)('offers no test when %s', (state) => {
		mocks.push.state = state;
		render(ProfilePage);

		expect(screen.queryByRole('button', { name: 'Send test notification' })).not.toBeInTheDocument();
	});

	it('disables the test button while a push step runs', () => {
		mocks.push.state = 'on';
		mocks.push.busy = true;
		render(ProfilePage);

		expect(screen.getByRole('button', { name: 'Send test notification' })).toBeDisabled();
	});

	it('puts the toggle back when turning on doesn\'t take', async () => {
		mocks.push.enable.mockResolvedValue(false);
		const user = userEvent.setup();
		render(ProfilePage);

		await user.click(pushToggle());

		expect(pushToggle()).not.toBeChecked();
	});

	it('disables the toggle while a push step runs', () => {
		mocks.push.busy = true;
		render(ProfilePage);

		expect(pushToggle()).toBeDisabled();
	});

	it.each([
		['unsupported', 'This browser doesn\'t support push notifications.'],
		['su', 'Push notifications can\'t be changed while su\'d.'],
		['unavailable', 'Push notifications aren\'t available right now.'],
		['denied', 'Notifications from Tabroom are blocked in this browser.'],
	] as const)('disables the toggle and explains why when %s', (state, message) => {
		mocks.push.state = state;
		render(ProfilePage);

		expect(pushToggle()).toBeDisabled();
		expect(screen.getByTestId('push-note')).toHaveTextContent(message);
	});
});
