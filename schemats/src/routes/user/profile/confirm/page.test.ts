import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { UserProfile } from '@tabroom/types';

import ConfirmPage from './+page.svelte';

const baseProfile: UserProfile = {
	email               : 'avery@example.org',
	first               : 'Avery',
	middle              : null,
	last                : 'Okafor',
	pronoun             : null,
	phone               : null,
	tz                  : 'America/Chicago',
	street              : null,
	city                : null,
	state               : null,
	country             : 'US',
	zip                 : null,
	postal              : null,
	noEmail             : true,
	emailUnconfirmed    : true,
	emailCodeExpired    : false,
	forcePasswordChange : false,
};

const mocks = vi.hoisted(() => ({
	profile: null as UserProfile | null,
	confirmMutateAsync: vi.fn(),
	resendMutateAsync: vi.fn(),
	invalidateQueries: vi.fn(),
	goto: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('$app/env/public', () => ({ CLASSIC_URL: 'https://www.tabroom.com' }));

vi.mock('$app/navigation', () => ({ goto: mocks.goto }));

vi.mock('@tanstack/svelte-query', async () => ({
	...await vi.importActual<typeof import('@tanstack/svelte-query')>('@tanstack/svelte-query'),
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('$lib/helpers/toasts', () => ({ toast: mocks.toast }));

vi.mock('$indexcards', () => ({
	createUserProfile: () => ({
		data: { status: 200, data: mocks.profile },
		error: null,
		isError: false,
		isSuccess: true,
		isLoading: false,
	}),
	createUserEmailConfirm: () => ({ mutateAsync: mocks.confirmMutateAsync }),
	createUserEmailResend: () => ({ mutateAsync: mocks.resendMutateAsync }),
	getUserProfileQueryKey: () => ['/v1/user/profile'],
	getUserHomeQueryKey: () => ['/v1/user/home'],
}));

const codeField = () => screen.getByRole('textbox', { name: /Confirmation code/ });

const problem = (status: number, title: string, detail: string, issues: unknown[] = []) => ({
	status,
	data: { type: 'about:blank', title, status, detail, issues },
});

describe('Confirm email page', () => {
	beforeEach(() => {
		mocks.profile = { ...baseProfile };
		mocks.confirmMutateAsync.mockResolvedValue({ status: 204, data: undefined });
		mocks.resendMutateAsync.mockResolvedValue({ status: 202, data: undefined });
		mocks.invalidateQueries.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('asks for the code sent to the person\'s address, sending nothing while that code still works', () => {
		render(ConfirmPage);

		expect(screen.getByText('avery@example.org', { selector: 'strong' })).toBeInTheDocument();
		expect(codeField()).toHaveAttribute('autocomplete', 'one-time-code');
		expect(mocks.resendMutateAsync).not.toHaveBeenCalled();
	});

	it('sends a new code on arrival, once, when the last one expired or never came', async () => {
		mocks.profile = { ...baseProfile, emailCodeExpired: true };
		render(ConfirmPage);

		await vi.waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith({
			message: 'Your last code had expired, so we sent a new one to avery@example.org',
		}));
		expect(mocks.resendMutateAsync).toHaveBeenCalledOnce();
	});

	it('sends nothing on arrival for an address already confirmed', () => {
		mocks.profile = { ...baseProfile, emailUnconfirmed: false, emailCodeExpired: false };
		render(ConfirmPage);

		expect(mocks.resendMutateAsync).not.toHaveBeenCalled();
	});

	it('confirms the code, refreshes the profile and home, and goes home', async () => {
		const user = userEvent.setup();
		render(ConfirmPage);

		await user.type(codeField(), 'hxk3qy');
		await user.click(screen.getByRole('button', { name: 'Confirm' }));

		expect(mocks.confirmMutateAsync).toHaveBeenCalledWith({ data: { code: 'hxk3qy' } });
		expect(mocks.toast.success).toHaveBeenCalledWith({ message: 'Your email address is confirmed' });
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/v1/user/profile'] });
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/v1/user/home'] });
		expect(mocks.goto).toHaveBeenCalledWith('/user/home');
	});

	it('shows a wrong code under the code field and stays', async () => {
		mocks.confirmMutateAsync.mockResolvedValue(problem(400, 'Request Validation Failed', 'That code isn\'t right', [
			{ path: ['code'], message: 'That code isn\'t right. Check the most recent email we sent.', code: 'custom' },
		]));
		const user = userEvent.setup();
		render(ConfirmPage);

		await user.type(codeField(), 'WRONG2');
		await user.click(screen.getByRole('button', { name: 'Confirm' }));

		expect(codeField()).toHaveAccessibleDescription(/That code isn't right/);
		expect(mocks.goto).not.toHaveBeenCalled();
		expect(mocks.toast.success).not.toHaveBeenCalled();
	});

	it('says an expired code has expired, under the field, pointing to a new one', async () => {
		mocks.confirmMutateAsync.mockResolvedValue(problem(410, 'This is no longer available.', 'Your code has expired. Send a new one.'));
		const user = userEvent.setup();
		render(ConfirmPage);

		await user.type(codeField(), 'HXK3QY');
		await user.click(screen.getByRole('button', { name: 'Confirm' }));

		expect(codeField()).toHaveAccessibleDescription(/Your code has expired/);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
	});

	it('sends a new code and clears the old one', async () => {
		const user = userEvent.setup();
		render(ConfirmPage);

		await user.type(codeField(), 'OLDCOD');
		await user.click(screen.getByRole('button', { name: 'Send a new code' }));

		expect(mocks.resendMutateAsync).toHaveBeenCalled();
		expect(mocks.toast.success).toHaveBeenCalledWith({ message: 'We sent a new code to avery@example.org' });
		expect(codeField()).toHaveValue('');
	});

	it('refreshes the profile when a resend is refused, so an address confirmed elsewhere shows as confirmed', async () => {
		mocks.resendMutateAsync.mockResolvedValue(problem(409, 'The request conflicts with the current state of the resource.', 'Your email address is already confirmed'));
		const user = userEvent.setup();
		render(ConfirmPage);

		await user.click(screen.getByRole('button', { name: 'Send a new code' }));

		expect(mocks.toast.success).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/v1/user/profile'] });
	});

	it('says an address already confirmed is confirmed, with no form', () => {
		mocks.profile = { ...baseProfile, emailUnconfirmed: false, noEmail: false };
		render(ConfirmPage);

		expect(screen.getByTestId('email-confirmed')).toHaveTextContent('avery@example.org, is confirmed');
		expect(screen.queryByRole('textbox', { name: /Confirmation code/ })).not.toBeInTheDocument();
	});
});
