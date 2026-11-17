import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import InboxPage from './+page.svelte';
import type { InboxListItem, InboxMessage, InboxPage as InboxPageData, UserInboxParams } from '$indexcards/schemas';

const queryClientRefetchQueries = vi.fn();
const inboxParams = vi.fn<(params: () => UserInboxParams) => void>();
const inboxRefetch = vi.fn();
const messageRefetch = vi.fn();
const markReadMutateAsync = vi.fn();
const markUnreadMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const markAllReadMutateAsync = vi.fn();

const inboxMessages: InboxListItem[] = [
	{
		id: 100,
		subject: 'Unread message',
		url: null,
		visible_at: '2026-04-20T12:00:00.000Z',
		read_at: null,
		Tourn: { id: 1, name: 'Tournament One', webname: 't1' },
		Sender: { name: 'Sender One', email: 'sender.one@example.com' },
	},
	{
		id: 101,
		subject: 'Read message',
		url: null,
		visible_at: '2026-04-19T12:00:00.000Z',
		read_at: '2026-04-19T13:00:00.000Z',
		Tourn: { id: 2, name: 'Tournament Two', webname: 't2' },
		Sender: { name: 'Sender Two', email: 'sender.two@example.com' },
	},
];

let inboxPage: InboxPageData;
let openMessage: InboxMessage | null;

vi.mock('@tanstack/svelte-query', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/svelte-query')>(
		'@tanstack/svelte-query',
	);

	return {
		...actual,
		useQueryClient: () => ({
			refetchQueries: queryClientRefetchQueries,
		}),
	};
});

vi.mock('$indexcards', () => ({
	createUserInbox: (params: () => UserInboxParams) => {
		inboxParams(params);
		return {
			get data() {
				return { status: 200, data: inboxPage };
			},
			error: null,
			isError: false,
			isSuccess: true,
			isLoading: false,
			isFetching: false,
			refetch: inboxRefetch,
		};
	},
	createUserInboxGetMessage: () => ({
		get data() {
			return openMessage && { status: 200, data: openMessage };
		},
		error: null,
		isError: false,
		isLoading: false,
		isPending: false,
		isSuccess: true,
		refetch: messageRefetch,
	}),
	createUserInboxMarkRead: () => ({
		mutateAsync: markReadMutateAsync,
		isPending: false,
	}),
	createUserInboxMarkUnread: () => ({
		mutateAsync: markUnreadMutateAsync,
		isPending: false,
	}),
	createUserInboxMarkDeleted: () => ({
		mutateAsync: deleteMutateAsync,
		isPending: false,
	}),
	createUserInboxMarkAllRead: () => ({
		mutateAsync: markAllReadMutateAsync,
		isPending: false,
	}),
	getUserInboxUnreadQueryKey: () => ['userInboxUnread'],
}));

describe('Inbox page UI', () => {
	beforeEach(() => {
		inboxPage = { items: inboxMessages, total: inboxMessages.length };
		openMessage = null;
		inboxParams.mockClear();
		inboxRefetch.mockResolvedValue({});
		messageRefetch.mockResolvedValue({});
		markReadMutateAsync.mockResolvedValue({ status: 204 });
		markUnreadMutateAsync.mockResolvedValue({ status: 204 });
		deleteMutateAsync.mockResolvedValue({ status: 204 });
		markAllReadMutateAsync.mockResolvedValue({ status: 204 });
		queryClientRefetchQueries.mockResolvedValue({});
	});

	it('asks for the first page of 50', () => {
		render(InboxPage);
		expect(inboxParams.mock.calls[0]?.[0]()).toEqual({ limit: 50, offset: 0 });
	});

	it('goes back a page when deleting the only message on the last page', async () => {
		const last = { ...inboxMessages[0]!, subject: 'Last message' };
		inboxPage = { items: [last], total: 51 };
		// The page derives the open message once, so the mock serves it from the start
		openMessage = { ...last, body: '<p>Last body</p>', Email: null };
		render(InboxPage);
		const params = inboxParams.mock.calls[0]![0];

		await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
		expect(params()).toEqual({ limit: 50, offset: 50 });

		inboxPage = { items: [], total: 50 };
		await userEvent.click(await screen.findByRole('button', { name: 'Delete message' }));

		await waitFor(() => {
			expect(deleteMutateAsync).toHaveBeenCalledWith({ messageId: 100 });
			expect(params()).toEqual({ limit: 50, offset: 0 });
		});
	});

	it('renders unread message subject with emphasis class', () => {
		const { container } = render(InboxPage);
		const listPane = container.querySelector('[data-testid="inbox-list-pane"]');
		expect(listPane).not.toBeNull();

		const unreadSubject = within(listPane as HTMLElement).getByText('Unread message');
		expect(unreadSubject).toHaveClass('font-semibold');
	});

	it('marks selected message as read and refreshes inbox + unread count', async () => {
		const { container } = render(InboxPage);
		const listPane = container.querySelector('[data-testid="inbox-list-pane"]');
		expect(listPane).not.toBeNull();

		const unreadCell = within(listPane as HTMLElement).getByText('Unread message');
		await userEvent.click(unreadCell);

		await waitFor(() => {
			expect(markReadMutateAsync).toHaveBeenCalledWith({ messageId: 100 });
			expect(inboxRefetch).toHaveBeenCalled();
			expect(queryClientRefetchQueries).toHaveBeenCalledWith({
				queryKey: ['userInboxUnread'],
			});
			expect(unreadCell.closest('tr')).toHaveClass('inbox-row-selected');
		});
	});

	it('keeps a stacked layout with viewport-capped list pane and flexible reader pane', async () => {
		const { container } = render(InboxPage);
		const panes = container.querySelector('[data-testid="inbox-panes"]');
		const listPane = container.querySelector('[data-testid="inbox-list-pane"]');
		const readerPane = container.querySelector('[data-testid="inbox-reader-pane"]');

		expect(panes).toHaveClass('flex-col');
		expect(listPane).toHaveClass('h-[33vh]');
		expect(listPane).toHaveClass('max-h-[33vh]');
		expect(readerPane).toHaveClass('flex-1');

		await userEvent.click(within(listPane as HTMLElement).getByText('Unread message'));

		await waitFor(() => {
			expect(listPane).toHaveClass('h-[33vh]');
			expect(readerPane).toHaveClass('flex-1');
		});
	});

	it('uses a fixed-height scrolling list container', () => {
		const { container } = render(InboxPage);
		const listPane = container.querySelector('[data-testid="inbox-list-pane"]');

		expect(listPane).toHaveClass('h-[33vh]');
		expect(listPane).toHaveClass('overflow-hidden');
	});

	it('marks all as read and refreshes inbox + unread count', async () => {
		render(InboxPage);
		await userEvent.click(
			screen.getByRole('button', { name: 'Mark all messages as read' }),
		);

		await waitFor(() => {
			expect(markAllReadMutateAsync).toHaveBeenCalledTimes(1);
			expect(inboxRefetch).toHaveBeenCalled();
			expect(queryClientRefetchQueries).toHaveBeenCalledWith({
				queryKey: ['userInboxUnread'],
			});
		});
	});
});
