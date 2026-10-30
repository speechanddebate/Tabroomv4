import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import type { ComponentProps } from 'svelte';
import UnsubscribePage from './+page.svelte';
import type { UnsubscribeStatus } from '$indexcards/schemas';

// The page reads only the token from its load data; the layout's session, query client, params, and form are not needed to render it
type PageProps = ComponentProps<typeof UnsubscribePage>;

const mocks = vi.hoisted(() => ({
	statusResponse: { status: 200, data: {} as unknown } as { status: number; data: unknown },
	invalidateQueries: vi.fn(),
	unsubscribeMutateAsync: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/svelte-query')>('@tanstack/svelte-query');
	return {
		...actual,
		useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
	};
});

vi.mock('$indexcards', () => ({
	createRestNotifyEmailUnsubscribeStatus: () => ({
		data: mocks.statusResponse,
		error: null,
		isError: false,
		isSuccess: true,
		isPending: false,
		isLoading: false,
		isFetching: false,
	}),
	createRestNotifyEmailUnsubscribe: () => ({
		mutateAsync: mocks.unsubscribeMutateAsync,
		isPending: false,
	}),
	getRestNotifyEmailUnsubscribeStatusQueryKey: (token: string) => ['restNotifyEmailUnsubscribeStatus', token],
}));

const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiIsImVtYWlsIjoiY0BleGFtcGxlLmNvbSJ9.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

const setStatus = (status: UnsubscribeStatus) => {
	mocks.statusResponse = { status: 200, data: status };
};

const renderPage = () => render(UnsubscribePage, { props: { data: { token } } as unknown as PageProps });

describe('Unsubscribe page', () => {
	beforeEach(() => {
		setStatus({ email: 'c***@example.com', noEmail: false });
		mocks.invalidateQueries.mockReset();
		mocks.unsubscribeMutateAsync.mockReset().mockResolvedValue({ status: 200, data: { unsubscribed: true, email: 'c***@example.com' } });
	});

	it('asks before stopping anything and names the masked address', () => {
		renderPage();

		expect(screen.getByRole('heading', { name: 'Stop Tabroom emails?' })).toBeInTheDocument();
		expect(screen.getByText('c***@example.com')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Stop these emails' })).toBeEnabled();
		expect(mocks.unsubscribeMutateAsync).not.toHaveBeenCalled();
	});

	it('warns people attending a tournament before they decide', () => {
		renderPage();

		const notice = screen.getByRole('note');
		expect(notice).toHaveTextContent('If you are attending a tournament, we highly recommend leaving emails on');
		expect(notice).toHaveClass('font-bold');
	});

	it('drops the tournament warning once the decision is made', () => {
		setStatus({ email: 'c***@example.com', noEmail: true });
		renderPage();

		expect(screen.queryByRole('note')).not.toBeInTheDocument();
	});

	it('uses the link when the button is pressed and then says so', async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole('button', { name: 'Stop these emails' }));

		expect(mocks.unsubscribeMutateAsync).toHaveBeenCalledWith({ token });
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: "You've unsubscribed" })).toBeInTheDocument();
		});
		expect(screen.queryByRole('button', { name: 'Stop these emails' })).not.toBeInTheDocument();
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['restNotifyEmailUnsubscribeStatus', token] });
	});

	it('stays on the question when the request fails', async () => {
		mocks.unsubscribeMutateAsync.mockResolvedValue({ status: 404, data: { title: 'Not Found', status: 404 } });
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole('button', { name: 'Stop these emails' }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Stop these emails' })).toBeEnabled();
		});
		expect(screen.queryByRole('heading', { name: "You've unsubscribed" })).not.toBeInTheDocument();
	});

	it('shows the done state right away for a link that was already used', () => {
		setStatus({ email: 'c***@example.com', noEmail: true });
		renderPage();

		expect(screen.getByRole('heading', { name: "You've unsubscribed" })).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'your profile' })).toHaveAttribute('href', '/user/profile');
	});

	it('explains a link the API does not recognize', () => {
		mocks.statusResponse = { status: 404, data: { title: 'Not Found', status: 404 } };
		renderPage();

		expect(screen.getByRole('heading', { name: "This link isn't valid" })).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'your profile' })).toHaveAttribute('href', '/user/profile');
	});

	it('keeps a loading note while the status has not arrived', () => {
		mocks.statusResponse = undefined as unknown as { status: number; data: unknown };
		renderPage();

		expect(screen.getByRole('status')).toHaveTextContent('Checking your link');
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});
});
