import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { UserProfile, UserSession } from '@tabroom/types';

import ProfilePage from './+page.svelte';
import type { PushState } from '$lib/helpers/pushState.svelte';

const baseProfile: UserProfile = {
	email               : 'avery@example.org',
	first               : 'Avery',
	middle              : null,
	last                : 'Okafor',
	pronoun             : 'they/them',
	phone               : '5155550142',
	tz                  : 'America/Chicago',
	street              : null,
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

const mocks = vi.hoisted(() => ({
	profile: null as UserProfile | null,
	updateMutateAsync: vi.fn(),
	setQueryData: vi.fn(),
	invalidateQueries: vi.fn(),
	sessions: [] as UserSession[],
	endMutateAsync: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
	beforeNavigate: vi.fn(),
	su: false,
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

vi.mock('$app/navigation', () => ({ beforeNavigate: mocks.beforeNavigate }));

vi.mock('@tanstack/svelte-query', async () => ({
	...await vi.importActual<typeof import('@tanstack/svelte-query')>('@tanstack/svelte-query'),
	useQueryClient: () => ({ setQueryData: mocks.setQueryData, invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('$lib/helpers/toasts', () => ({ toast: mocks.toast }));

vi.mock('$lib/helpers/SessionContext.svelte', () => ({ isSuSession: () => mocks.su }));

vi.mock('$indexcards', () => ({
	createUserProfile: () => ({
		data: { status: 200, data: mocks.profile },
		error: null,
		isError: false,
		isSuccess: true,
		isLoading: false,
	}),
	createUserProfileUpdate: () => ({ mutateAsync: mocks.updateMutateAsync }),
	getUserProfileQueryKey: () => ['/v1/user/profile'],
	createUserSessions: () => ({
		data: { status: 200, data: mocks.sessions },
		error: null,
		isError: false,
		isSuccess: true,
		isLoading: false,
	}),
	createUserSessionEnd: () => ({ mutateAsync: mocks.endMutateAsync }),
	getUserSessionsQueryKey: () => ['/v1/user/sessions'],
}));

vi.mock('$lib/helpers/pushState.svelte', () => ({
	createPushState: () => mocks.push,
}));

const pushSwitch = () => screen.getByRole('switch', { name: 'Receive notifications on this browser' });
const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

describe('Profile page', () => {
	beforeEach(() => {
		mocks.profile = { ...baseProfile };
		mocks.su = false;
		mocks.push.state = 'undecided';
		mocks.push.busy = false;
		mocks.updateMutateAsync.mockImplementation(async ({ data }) => ({ status: 200, data: { ...mocks.profile, ...data } }));
		mocks.sessions = [];
		mocks.endMutateAsync.mockResolvedValue({ status: 204, data: undefined });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('profile form', () => {
		it('shows the saved profile', () => {
			render(ProfilePage);

			expect(screen.getByLabelText(/First name/)).toHaveValue('Avery');
			expect(screen.getByLabelText('Pronouns', { exact: false })).toHaveValue('they/them');
			expect(screen.getByLabelText('State')).toHaveValue('IA');
			expect(screen.getByLabelText('Time zone')).toHaveValue('America/Chicago');
			expect(screen.getByText('All changes saved')).toBeInTheDocument();
		});

		it('sends only the fields that changed', async () => {
			const user = userEvent.setup();
			render(ProfilePage);

			await user.clear(screen.getByLabelText(/First name/));
			await user.type(screen.getByLabelText(/First name/), 'Ann');
			await user.selectOptions(screen.getByLabelText('Time zone'), 'America/Denver');
			expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
			await user.click(saveButton());

			expect(mocks.updateMutateAsync).toHaveBeenCalledWith({ data: { first: 'Ann', tz: 'America/Denver' } });
			const [key, update] = mocks.setQueryData.mock.calls[0]!;
			expect(key).toEqual(['/v1/user/profile']);
			expect(update({ status: 200, data: baseProfile })).toEqual({ status: 200, data: { ...baseProfile, first: 'Ann', tz: 'America/Denver' } });
			expect(screen.getByText('All changes saved')).toBeInTheDocument();
		});

		it('shows a field as the server stored it after the save', async () => {
			mocks.updateMutateAsync.mockResolvedValue({ status: 200, data: { ...baseProfile, phone: '5155550199' } });
			const user = userEvent.setup();
			render(ProfilePage);

			await user.clear(screen.getByLabelText('Phone'));
			await user.type(screen.getByLabelText('Phone'), '+1 (515) 555-0199');
			await user.click(saveButton());

			expect(screen.getByLabelText('Phone')).toHaveValue('5155550199');
			expect(screen.getByText('All changes saved')).toBeInTheDocument();
		});

		it('shows a ZIP code for the US and a postal code elsewhere', async () => {
			const user = userEvent.setup();
			render(ProfilePage);

			expect(screen.getByLabelText('ZIP code')).toHaveValue('50309');
			expect(screen.queryByLabelText('Postal code')).not.toBeInTheDocument();

			await user.selectOptions(screen.getByLabelText('Country'), 'CA');

			expect(screen.getByLabelText('Postal code')).toHaveValue('');
			expect(screen.queryByLabelText('ZIP code')).not.toBeInTheDocument();
		});

		it('doesn\'t send an edit to the code field the country no longer shows', async () => {
			const user = userEvent.setup();
			render(ProfilePage);

			await user.clear(screen.getByLabelText('ZIP code'));
			await user.type(screen.getByLabelText('ZIP code'), '50310');
			await user.selectOptions(screen.getByLabelText('Country'), 'CA');
			await user.click(saveButton());

			expect(mocks.updateMutateAsync).toHaveBeenCalledWith({ data: { country: 'CA' } });
			expect(screen.getByText('All changes saved')).toBeInTheDocument();
		});

		it.each([['CET'], ['US/Eastern']])('keeps a stored legacy time zone %s selected', (tz) => {
			mocks.profile = { ...baseProfile, tz };
			render(ProfilePage);

			expect(screen.getByLabelText('Time zone')).toHaveValue(tz);
		});

		it('keeps a stored state that is no longer on the list selected', () => {
			mocks.profile = { ...baseProfile, state: 'DE-M', country: 'DE' };
			render(ProfilePage);

			expect(screen.getByLabelText('State')).toHaveValue('DE-M');
		});

		it('puts each field\'s problem under that field', async () => {
			mocks.updateMutateAsync.mockResolvedValue({
				status: 409,
				data: {
					title: 'Conflict',
					status: 409,
					detail: 'That phone number is already in use on another account',
					issues: [{ path: ['phone'], message: 'That phone number is already in use on another account', code: 'custom' }],
				},
			});
			const user = userEvent.setup();
			render(ProfilePage);

			await user.clear(screen.getByLabelText('Phone'));
			await user.type(screen.getByLabelText('Phone'), '5155550199');
			await user.click(saveButton());

			expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
			expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription('That phone number is already in use on another account');
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
			expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
		});

		it('discards the edits', async () => {
			const user = userEvent.setup();
			render(ProfilePage);

			await user.type(screen.getByLabelText('City'), ' West');
			await user.click(screen.getByRole('button', { name: 'Discard' }));

			expect(screen.getByLabelText('City')).toHaveValue('Des Moines');
			expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
		});

		describe('leaving the page', () => {
			const leave = (willUnload: boolean) => {
				const cancel = vi.fn();
				mocks.beforeNavigate.mock.calls[0]![0]({ willUnload, cancel });
				return cancel;
			};

			it('lets the person go when nothing is unsaved', () => {
				const confirm = vi.spyOn(window, 'confirm');
				render(ProfilePage);

				expect(leave(false)).not.toHaveBeenCalled();
				expect(confirm).not.toHaveBeenCalled();
			});

			it.each([
				[false, 1],
				[true, 0],
			])('asks first with unsaved changes; answering %s cancels %i times', async (answer, cancels) => {
				vi.spyOn(window, 'confirm').mockReturnValue(answer);
				const user = userEvent.setup();
				render(ProfilePage);

				await user.type(screen.getByLabelText('City'), ' West');

				expect(leave(false)).toHaveBeenCalledTimes(cancels);
			});

			it('leaves the browser to ask when the tab is closing', async () => {
				const confirm = vi.spyOn(window, 'confirm');
				const user = userEvent.setup();
				render(ProfilePage);

				await user.type(screen.getByLabelText('City'), ' West');

				expect(leave(true)).toHaveBeenCalled();
				expect(confirm).not.toHaveBeenCalled();
			});
		});

		describe('email', () => {
			const emailField = () => screen.getByRole('textbox', { name: 'Email' });
			const passwordField = () => screen.queryByLabelText(/Current password/);

			it('shows the email as a field, with no password field until it changes', () => {
				render(ProfilePage);

				expect(emailField()).toHaveValue('avery@example.org');
				expect(passwordField()).not.toBeInTheDocument();
			});

			it('asks for the current password once the email changes, sends both, then clears it', async () => {
				mocks.updateMutateAsync.mockResolvedValue({ status: 200, data: { ...baseProfile, email: 'new@example.org', emailUnconfirmed: true, noEmail: true } });
				const user = userEvent.setup();
				render(ProfilePage);

				await user.clear(emailField());
				await user.type(emailField(), 'new@example.org');
				await user.type(passwordField()!, 'current-pass');
				await user.click(saveButton());

				expect(mocks.updateMutateAsync).toHaveBeenCalledWith({ data: { email: 'new@example.org', currentPassword: 'current-pass' } });
				expect(passwordField()).not.toBeInTheDocument();
				expect(mocks.toast.success).toHaveBeenCalledWith({ message: 'We sent a confirmation code to new@example.org' });
				expect(screen.getByText('All changes saved')).toBeInTheDocument();
			});

			it('doesn\'t treat a change of case or spaces as a new email', async () => {
				const user = userEvent.setup();
				render(ProfilePage);

				await user.clear(emailField());
				await user.type(emailField(), ' AVERY@example.org');
				expect(passwordField()).not.toBeInTheDocument();
				await user.type(screen.getByLabelText('City'), ' West');
				await user.click(saveButton());

				expect(mocks.updateMutateAsync).toHaveBeenCalledWith({ data: { city: 'Des Moines West' } });
				expect(emailField()).toHaveValue('avery@example.org');
			});

			it('shows a wrong password under the password field and keeps the edit', async () => {
				mocks.updateMutateAsync.mockResolvedValue({
					status: 403,
					data: {
						title: 'You Do Not Have Access to This Resource',
						status: 403,
						detail: 'That password isn\'t right',
						issues: [{ path: ['currentPassword'], message: 'That password isn\'t right', code: 'custom' }],
					},
				});
				const user = userEvent.setup();
				render(ProfilePage);

				await user.clear(emailField());
				await user.type(emailField(), 'new@example.org');
				await user.type(passwordField()!, 'wrong');
				await user.click(saveButton());

				expect(passwordField()).toHaveAccessibleDescription(/That password isn't right/);
				expect(emailField()).toHaveValue('new@example.org');
				expect(mocks.toast.success).not.toHaveBeenCalled();
			});

			it('makes the email read-only while su\'d', () => {
				mocks.su = true;
				render(ProfilePage);

				expect(emailField()).toHaveAttribute('readonly');
				expect(emailField()).toHaveAccessibleDescription('Email can\'t be changed while su\'d.');
			});
		});

		it('offers the no-email choice once the email is confirmed', () => {
			render(ProfilePage);

			expect(screen.getByRole('checkbox', { name: /Don't send me email/ })).not.toBeChecked();
		});

		it('hides the no-email choice while the email is unconfirmed', () => {
			mocks.profile = { ...baseProfile, emailUnconfirmed: true };
			render(ProfilePage);

			expect(screen.queryByRole('checkbox', { name: /Don't send me email/ })).not.toBeInTheDocument();
			const email = screen.getByTestId('profile-email');
			expect(email).toHaveTextContent('Not confirmed yet');
			expect(within(email).getByRole('link', { name: 'Confirm your email' })).toHaveAttribute('href', '/user/profile/confirm');
		});

		it('links to classic to change the password', () => {
			render(ProfilePage);

			expect(screen.getByRole('link', { name: 'Change your password' }))
				.toHaveAttribute('href', 'https://www.tabroom.com/user/login/profile.mhtml');
		});

		it('shows only the password notice while a password change is required', () => {
			mocks.profile = { ...baseProfile, forcePasswordChange: true };
			render(ProfilePage);

			expect(screen.getByTestId('forced-password-change')).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Change your password on the classic site' }))
				.toHaveAttribute('href', 'https://www.tabroom.com/user/login/profile.mhtml');
			expect(screen.queryByLabelText(/First name/)).not.toBeInTheDocument();
			expect(screen.queryByRole('switch')).not.toBeInTheDocument();
			expect(screen.queryByTestId('sessions')).not.toBeInTheDocument();
		});
	});

	describe('sidebar', () => {
		it('says the account functions are still on classic, with one link there', () => {
			render(ProfilePage);

			const functions = within(screen.getByTestId('account-functions'));
			expect(functions.getByText(/still on the classic site/)).toBeInTheDocument();
			expect(functions.getAllByRole('link')).toHaveLength(1);
			expect(functions.getByRole('link', { name: 'Your profile on the classic site' }))
				.toHaveAttribute('href', 'https://www.tabroom.com/user/login/profile.mhtml');
			expect(screen.getByRole('heading', { name: 'Don\'t Share Passwords' })).toBeInTheDocument();
			expect(screen.getByRole('heading', { name: 'Privacy' })).toBeInTheDocument();
		});

		it('shows only the notices while a password change is required', () => {
			mocks.profile = { ...baseProfile, forcePasswordChange: true };
			render(ProfilePage);

			expect(screen.queryByTestId('account-functions')).not.toBeInTheDocument();
			expect(screen.getByRole('heading', { name: 'Don\'t Share Passwords' })).toBeInTheDocument();
		});
	});

	describe('sessions', () => {
		const session = (overrides: Partial<UserSession>): UserSession => ({
			id: 1,
			current: false,
			subscribed: false,
			disabled: false,
			host: null,
			browser: 'Chrome',
			os: 'Windows 10',
			ip: '203.0.113.7',
			last_access: '2026-11-16T14:05:00.000Z',
			created_at: '2026-11-01T14:05:00.000Z',
			...overrides,
		});

		const rows = () => within(screen.getByTestId('sessions')).getAllByRole('row').slice(1);

		it('lists the current session first, marked and not endable', () => {
			mocks.sessions = [
				session({ id: 2, browser: 'Safari', os: 'iOS 18.1' }),
				session({ id: 1, current: true, browser: 'Firefox', os: 'Linux' }),
			];
			render(ProfilePage);

			const [first, second] = rows();
			expect(first).toHaveTextContent('Firefox on Linux');
			expect(first).toHaveTextContent('This browser');
			expect(within(first!).queryByRole('button')).not.toBeInTheDocument();
			expect(second).toHaveTextContent('Safari on iOS 18.1');
			expect(within(second!).getByRole('button', { name: 'End session on Safari on iOS 18.1' })).toBeEnabled();
		});

		it('shows the IP and last active in the person\'s time zone', () => {
			mocks.sessions = [session({ id: 2 })];
			render(ProfilePage);

			const [row] = rows();
			expect(row).toHaveTextContent('203.0.113.7');
			expect(row!.textContent).toMatch(/8:05/);
		});

		it('says so when the browser is unknown', () => {
			mocks.sessions = [session({ id: 2, browser: null, os: null })];
			render(ProfilePage);

			expect(rows()[0]).toHaveTextContent('Unknown browser');
		});

		it('ends a session and refreshes the list', async () => {
			mocks.sessions = [session({ id: 1, current: true }), session({ id: 2, browser: 'Safari', os: 'macOS Catalina' })];
			const user = userEvent.setup();
			render(ProfilePage);

			await user.click(screen.getByRole('button', { name: 'End session on Safari on macOS Catalina' }));

			expect(mocks.endMutateAsync).toHaveBeenCalledWith({ sessionId: 2 });
			expect(mocks.toast.success).toHaveBeenCalledWith({ message: 'Logged out Safari on macOS Catalina' });
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/v1/user/sessions'] });
		});

		it('shows the problem and no success when ending is refused', async () => {
			mocks.sessions = [session({ id: 2 })];
			mocks.endMutateAsync.mockResolvedValue({
				status: 404,
				data: { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Session 2 not found' },
			});
			const user = userEvent.setup();
			render(ProfilePage);

			await user.click(screen.getByRole('button', { name: /End session/ }));

			expect(mocks.toast.success).not.toHaveBeenCalled();
			expect(mocks.toast.warning).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Session 2 not found' }));
			expect(mocks.invalidateQueries).toHaveBeenCalled();
		});

		it('shows the error and no success when the request fails', async () => {
			mocks.sessions = [session({ id: 2 })];
			mocks.endMutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));
			const user = userEvent.setup();
			render(ProfilePage);

			await user.click(screen.getByRole('button', { name: /End session/ }));

			expect(mocks.toast.success).not.toHaveBeenCalled();
			expect(mocks.toast.error).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Failed to fetch' }));
		});
	});

	describe('push notifications', () => {
		it('reads the browser permission on mount', () => {
			render(ProfilePage);

			expect(mocks.push.readPermission).toHaveBeenCalled();
		});

		it.each([
			['undecided'],
			['off'],
		] as const)('turns notifications on from the switch when %s', async (state) => {
			mocks.push.state = state;
			mocks.push.enable.mockResolvedValue(true);
			const user = userEvent.setup();
			render(ProfilePage);

			expect(pushSwitch()).not.toBeChecked();
			await user.click(pushSwitch());

			expect(mocks.push.enable).toHaveBeenCalled();
			expect(mocks.push.turnOff).not.toHaveBeenCalled();
		});

		it('turns notifications off from the switch when on', async () => {
			mocks.push.state = 'on';
			mocks.push.turnOff.mockResolvedValue(true);
			const user = userEvent.setup();
			render(ProfilePage);

			expect(pushSwitch()).toBeChecked();
			await user.click(pushSwitch());

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

		it('puts the switch back when turning on doesn\'t take', async () => {
			mocks.push.enable.mockResolvedValue(false);
			const user = userEvent.setup();
			render(ProfilePage);

			await user.click(pushSwitch());

			expect(pushSwitch()).not.toBeChecked();
		});

		it('disables the switch while a push step runs', () => {
			mocks.push.busy = true;
			render(ProfilePage);

			expect(pushSwitch()).toBeDisabled();
		});

		it.each([
			['unsupported', 'This browser doesn\'t support push notifications.'],
			['su', 'Push notifications can\'t be changed while su\'d.'],
			['unavailable', 'Push notifications aren\'t available right now.'],
			['denied', 'Notifications from Tabroom are blocked in this browser.'],
		] as const)('disables the switch and explains why when %s', (state, message) => {
			mocks.push.state = state;
			render(ProfilePage);

			expect(pushSwitch()).toBeDisabled();
			expect(screen.getByTestId('push-note')).toHaveTextContent(message);
		});
	});
});
