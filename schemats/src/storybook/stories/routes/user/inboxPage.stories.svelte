<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import type { InboxMessage } from '#indexcards/schemas';
	import {
		getUserInboxMarkAllReadMockHandler,
		getUserInboxGetMessageMockHandler,
		getUserInboxMarkDeletedMockHandler,
		getUserInboxMarkReadMockHandler,
		getUserInboxMockHandler,
		getUserInboxUnreadMockHandler,
		getUserInboxMarkUnreadMockHandler,
	} from '#indexcards/index.msw';
	import InboxPage from '../../../../routes/user/inbox/+page.svelte';

	const nowISO = '2026-04-22T12:00:00.000Z';

	const createInboxMessages = (count = 8): InboxMessage[] =>
		Array.from({ length: count }, (_, idx) => {
			const id = idx + 1;
			const unread = idx % 3 !== 0;
			return {
				id,
				subject: unread ? `Unread notice ${id}` : `Read notice ${id}`,
				body: `<p>This is message ${id}.</p>`,
				url: null,
				visible_at: new Date(Date.parse(nowISO) - (idx + 1) * 3_600_000).toISOString(),
				read_at: unread ? null : nowISO,
				Tourn: {
					id: 100 + id,
					name: `Tournament ${id}`,
					webname: `tournament-${id}`,
				},
				Sender: {
					name: id % 2 === 0 ? null : `Sender ${id}`,
					email: id % 2 === 0 ? null : `sender${id}@example.com`,
				},
				Email: {
					content: `<p><strong>Inbox message ${id}</strong> preview from Storybook.</p>`,
				},
			};
		});

	const createInboxHandlers = (count = 8) => {
		let inbox = createInboxMessages(count);

		return [
			getUserInboxMockHandler(({ request }) => {
				const { searchParams } = new URL(request.url);
				const limit = Number(searchParams.get('limit') ?? 50);
				const offset = Number(searchParams.get('offset') ?? 0);
				return {
					items: inbox.slice(offset, offset + limit).map(({ body: _body, Email: _email, ...item }) => item),
					total: inbox.length,
				};
			}),
			getUserInboxUnreadMockHandler(() => ({
				count: inbox.filter((msg) => !msg.read_at).length,
			})),
			getUserInboxGetMessageMockHandler((info) => {
				const messageId = Number(info.params.messageId ?? 0);
				return inbox.find((msg) => msg.id === messageId) ?? inbox[0];
			}),
			getUserInboxMarkReadMockHandler((info) => {
				const messageId = Number(info.params.messageId ?? 0);
				inbox = inbox.map((msg) =>
					msg.id === messageId ? { ...msg, read_at: nowISO } : msg,
				);
			}),
			getUserInboxMarkAllReadMockHandler(() => {
				inbox = inbox.map((msg) => ({ ...msg, read_at: nowISO }));
			}),
			getUserInboxMarkDeletedMockHandler((info) => {
				const messageId = Number(info.params.messageId ?? 0);
				inbox = inbox.filter((msg) => msg.id !== messageId);
			}),
			getUserInboxMarkUnreadMockHandler((info) => {
				const messageId = Number(info.params.messageId ?? 0);
				inbox = inbox.map((msg) =>
					msg.id === messageId ? { ...msg, read_at: null } : msg,
				);
			}),
		];
	};

	const { Story } = defineMeta({
		title: 'Routes/User/Inbox',
		component: InboxPage,
		parameters: {
			layout: 'fullscreen',
			a11y: {
				config: {
					rules: [
						{ id: 'scrollable-region-focusable', enabled: false },
						{ id: 'empty-table-header', enabled: false },
					],
				},
			},
		},
	});
</script>

<Story
	name="Default"
	parameters={{
		msw: {
			handlers: createInboxHandlers(8),
		},
	}}
/>

<Story
	name="Selected Message"
	parameters={{
		msw: {
			handlers: createInboxHandlers(8),
		},
	}}
	play={async ({ canvasElement, step }) => {
		const canvas = within(canvasElement);

		await step('select an unread message from the list', async () => {
			await userEvent.click(await canvas.findByText('Unread notice 2'));
		});

		await step('show message viewer controls', async () => {
			await expect(await canvas.findByRole('button', { name: 'Delete message' })).toBeInTheDocument();
			await expect(await canvas.findByRole('button', { name: 'Mark message as unread' })).toBeInTheDocument();
		});
	}}
/>

<Story
	name="Long Inbox Scroll"
	parameters={{
		msw: {
			handlers: createInboxHandlers(30),
		},
	}}
/>

<Story
	name="Several Pages"
	parameters={{
		msw: {
			handlers: createInboxHandlers(120),
		},
	}}
	play={async ({ canvasElement, step }) => {
		const canvas = within(canvasElement);

		await step('show the newest page first', async () => {
			await expect(await canvas.findByText('1-50 of 120')).toBeInTheDocument();
			await expect(canvas.getByText('Unread notice 2')).toBeInTheDocument();
		});

		await step('page to the last messages', async () => {
			await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
			await expect(await canvas.findByText('Read notice 52')).toBeInTheDocument();
			await waitFor(() => expect(canvas.getByRole('button', { name: 'Next page' })).toBeEnabled());
			await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
			await expect(await canvas.findByText('101-120 of 120')).toBeInTheDocument();
			await expect(await canvas.findByText('Unread notice 120')).toBeInTheDocument();
		});
	}}
/>

