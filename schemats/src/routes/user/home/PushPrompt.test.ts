import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import PushPrompt, { SNOOZE_KEY, SNOOZE_MS } from './PushPrompt.svelte';
import type { PushState } from '$lib/helpers/pushState.svelte';

const mocks = vi.hoisted(() => ({
	push: {
		state: null as PushState | null,
		busy: false,
		readPermission: vi.fn(),
		enable: vi.fn(),
		turnOff: vi.fn(),
	},
	toastSuccess: vi.fn(),
}));

vi.mock('$lib/helpers/pushState.svelte', () => ({
	createPushState: () => mocks.push,
}));

vi.mock('$lib/helpers/toasts', () => ({
	toast: { success: mocks.toastSuccess },
}));

const NOW = new Date('2026-11-02T12:00:00.000Z').getTime();

describe('PushPrompt', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		localStorage.clear();
		mocks.push.state = 'undecided';
		mocks.push.busy = false;
		mocks.push.enable.mockResolvedValue(true);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('asks someone who hasn\'t decided to turn notifications on', () => {
		render(PushPrompt);

		expect(screen.getByTestId('push-prompt')).toBeInTheDocument();
		expect(mocks.push.readPermission).toHaveBeenCalled();
	});

	it.each([
		['loading', null],
		['on', 'on'],
		['off', 'off'],
		['denied', 'denied'],
		['su', 'su'],
		['unsupported', 'unsupported'],
		['unavailable', 'unavailable'],
	] as const)('stays hidden when %s', (_name, state) => {
		mocks.push.state = state;
		render(PushPrompt);

		expect(screen.queryByTestId('push-prompt')).not.toBeInTheDocument();
	});

	it('turns notifications on and says so', async () => {
		const user = userEvent.setup();
		render(PushPrompt);

		await user.click(screen.getByRole('button', { name: 'Turn on' }));

		expect(mocks.push.enable).toHaveBeenCalled();
		expect(mocks.toastSuccess).toHaveBeenCalledWith({ message: 'Notifications are on for this browser' });
	});

	it('says nothing when turning on doesn\'t take', async () => {
		mocks.push.enable.mockResolvedValue(false);
		const user = userEvent.setup();
		render(PushPrompt);

		await user.click(screen.getByRole('button', { name: 'Turn on' }));

		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	it('disables the button while a push step runs', () => {
		mocks.push.busy = true;
		render(PushPrompt);

		expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
	});

	it('hides and snoozes for 30 days on "Not now"', async () => {
		const user = userEvent.setup();
		render(PushPrompt);

		await user.click(screen.getByRole('button', { name: 'Not now' }));

		expect(screen.queryByTestId('push-prompt')).not.toBeInTheDocument();
		expect(localStorage.getItem(SNOOZE_KEY)).toBe(String(NOW + SNOOZE_MS));
	});

	it('stays hidden while snoozed', () => {
		localStorage.setItem(SNOOZE_KEY, String(NOW + 1000));
		render(PushPrompt);

		expect(screen.queryByTestId('push-prompt')).not.toBeInTheDocument();
	});

	it('comes back once the snooze runs out', () => {
		localStorage.setItem(SNOOZE_KEY, String(NOW - 1000));
		render(PushPrompt);

		expect(screen.getByTestId('push-prompt')).toBeInTheDocument();
	});

	it('still shows and dismisses when storage is blocked', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const user = userEvent.setup();
		render(PushPrompt);

		await user.click(screen.getByRole('button', { name: 'Not now' }));

		expect(screen.queryByTestId('push-prompt')).not.toBeInTheDocument();
	});
});
