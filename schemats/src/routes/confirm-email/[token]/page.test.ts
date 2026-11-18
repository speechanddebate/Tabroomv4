import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import type { ComponentProps } from 'svelte';
import ConfirmEmailPage from './+page.svelte';

// The page reads only the token from its load data; the layout's session and query client are not needed to render it
type PageProps = ComponentProps<typeof ConfirmEmailPage>;

const mocks = vi.hoisted(() => ({
	statusResponse: { status: 200, data: {} as unknown } as { status: number; data: unknown },
	invalidateQueries: vi.fn(),
	confirmMutateAsync: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', async () => ({
	...await vi.importActual<typeof import('@tanstack/svelte-query')>('@tanstack/svelte-query'),
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('$indexcards', () => ({
	createRestEmailConfirmStatus: () => ({
		data: mocks.statusResponse,
		error: null,
		isError: false,
		isSuccess: true,
		isPending: false,
		isLoading: false,
		isFetching: false,
	}),
	createRestEmailConfirm: () => ({ mutateAsync: mocks.confirmMutateAsync, isPending: false }),
	getRestEmailConfirmStatusQueryKey: (token: string) => ['restEmailConfirmStatus', token],
	getUserProfileQueryKey: () => ['/v1/user/profile'],
	getUserHomeQueryKey: () => ['/v1/user/home'],
}));

const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

const problem = (status: number, title: string) => ({ status, data: { type: 'about:blank', title, status, detail: title } });

const renderPage = () => render(ConfirmEmailPage, { props: { data: { token } } as unknown as PageProps });

describe('Confirm email link page', () => {
	beforeEach(() => {
		mocks.statusResponse = { status: 200, data: { email: 'a***@example.org', confirmed: false } };
		mocks.invalidateQueries.mockReset().mockResolvedValue(undefined);
		mocks.confirmMutateAsync.mockReset().mockResolvedValue({ status: 200, data: { confirmed: true, email: 'a***@example.org' } });
	});

	it('names the masked address and waits for a press, confirming nothing on load', () => {
		renderPage();

		expect(screen.getByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
		expect(screen.getByText('a***@example.org')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm my email address' })).toBeEnabled();
		expect(mocks.confirmMutateAsync).not.toHaveBeenCalled();
	});

	it('confirms on the press and refreshes the link, profile and home', async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole('button', { name: 'Confirm my email address' }));

		expect(mocks.confirmMutateAsync).toHaveBeenCalledWith({ token });
		expect(await screen.findByRole('heading', { name: 'Your email is confirmed' })).toBeInTheDocument();
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['restEmailConfirmStatus', token] });
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/v1/user/profile'] });
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/v1/user/home'] });
	});

	it('says an address already confirmed is confirmed', () => {
		mocks.statusResponse = { status: 200, data: { email: 'a***@example.org', confirmed: true } };
		renderPage();

		expect(screen.getByRole('heading', { name: 'Your email is confirmed' })).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it.each([
		[410, 'This link has expired'],
		[404, 'This link no longer works'],
	])('a %i link says so and points to a new code', (status, heading) => {
		mocks.statusResponse = problem(status, heading);
		renderPage();

		expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'get a new code' })).toHaveAttribute('href', '/user/profile/confirm');
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('keeps checking while the API can\'t answer', () => {
		mocks.statusResponse = problem(503, 'Unavailable');
		renderPage();

		expect(screen.getByRole('status')).toHaveTextContent('Checking your link');
	});
});
