import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { UserProfile } from '@tabroom/types';

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
	forcePasswordChange : false,
};

const mocks = vi.hoisted(() => ({
	profile: null as UserProfile | null,
	updateMutateAsync: vi.fn(),
	setQueryData: vi.fn(),
	beforeNavigate: vi.fn(),
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
	useQueryClient: () => ({ setQueryData: mocks.setQueryData }),
}));

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
}));

vi.mock('$lib/helpers/pushState.svelte', () => ({
	createPushState: () => mocks.push,
}));

const pushSwitch = () => screen.getByRole('switch', { name: 'Receive notifications on this browser' });
const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

describe('Profile page', () => {
	beforeEach(() => {
		mocks.profile = { ...baseProfile };
		mocks.push.state = 'undecided';
		mocks.push.busy = false;
		mocks.updateMutateAsync.mockImplementation(async ({ data }) => ({ status: 200, data: { ...mocks.profile, ...data } }));
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

		it('shows the email with a link to change it on classic', () => {
			render(ProfilePage);

			const email = screen.getByTestId('profile-email');
			expect(email).toHaveTextContent('avery@example.org');
			expect(within(email).getByRole('link', { name: 'Change your email on the classic site' }))
				.toHaveAttribute('href', 'https://www.tabroom.com/user/login/profile.mhtml');
		});

		it('offers the no-email choice once the email is confirmed', () => {
			render(ProfilePage);

			expect(screen.getByRole('checkbox', { name: /Don't send me email/ })).not.toBeChecked();
		});

		it('hides the no-email choice while the email is unconfirmed', () => {
			mocks.profile = { ...baseProfile, emailUnconfirmed: true };
			render(ProfilePage);

			expect(screen.queryByRole('checkbox', { name: /Don't send me email/ })).not.toBeInTheDocument();
			expect(screen.getByTestId('profile-email')).toHaveTextContent('Not confirmed yet');
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
