<script lang="ts">
	import type { InboxMessage } from '$indexcards/schemas';
	import Button from '$lib/components/Button.svelte';
	import { showDateTime } from '$lib/helpers/dt';
	import { Spinner } from 'flowbite-svelte';
	import { Mail, Trash2 } from '@lucide/svelte';

	const { message, onDeleteClick, onMarkUnreadClick, loading = false }: {
		message: InboxMessage | null,
		onDeleteClick: (_msgId: number) => void,
		onMarkUnreadClick?: (_msgId: number) => void,
		loading?: boolean
	} = $props();

</script>
<div class="flex min-h-[18rem] flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm">
{#if message}
	{@const senderName = message.Sender?.name?.trim() || 'Unknown sender'}
	{@const senderEmail = message.Sender?.email?.trim() || 'No email available'}
	{@const subject = message.subject?.trim() || 'No subject'}
	{@const tournName = message.Tourn?.name?.trim() || 'None'}
	{@const sentAt = showDateTime({dtISO: message.visible_at ?? undefined})}
	{@const content = message.Email?.content?.trim() || message.body?.trim() || ''}
	<div class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
		<dl
			class="
				grid flex-1 gap-x-4 gap-y-2 text-sm
				md:grid-cols-[9rem_minmax(0,1fr)]
			"
		>
			<dt class="font-semibold text-muted">Subject</dt>
			<dd class="text-text">{subject}</dd>
			<dt class="font-semibold text-muted">Sender</dt>
			<dd class="text-text">{senderName}</dd>

			<dt class="font-semibold text-muted">Sender email</dt>
			<dd>
				{#if message.Sender?.email}
					<a class="text-primary-strong underline break-all" href={`mailto:${message.Sender.email}`}>{message.Sender.email}</a>
				{:else}
					<span class="text-muted">{senderEmail}</span>
				{/if}
			</dd>

			<dt class="font-semibold text-muted">Sent</dt>
			<dd class="text-text">{sentAt}</dd>

			<dt class="font-semibold text-muted">Tournament</dt>
			<dd class="text-text">{tournName}</dd>
		</dl>

		<div class="flex items-center gap-2">
			<Button
				disabled={!onMarkUnreadClick}
				label="Mark message as unread"
				onclick={() => onMarkUnreadClick?.(message.id)}
				variant="outline"
			>
				<Mail class="h-5 w-5" />
			</Button>
			<Button
				color="danger"
				label="Delete message"
				onclick={() => onDeleteClick(message.id)}
				variant="outline"
			>
				<Trash2 class="h-5 w-5" />
			</Button>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-auto px-4 py-4">
		{#if content}
			<div class="message-reader-body text-sm leading-6 text-text">
				{@html content}
			</div>
		{:else}
			<p class="italic text-muted">No message content.</p>
		{/if}
	</div>
{:else if loading}
	<div class="flex w-full flex-1 items-center justify-center p-6">
		<Spinner type="bars" />
	</div>
{:else}
	<section
		class="
			flex h-full w-full flex-1 items-center justify-center
			rounded-md border border-dashed border-border bg-surface-alt px-6 py-10 text-center
		"
	>
		<div class="max-w-md">
			<h2 class="text-base font-semibold text-text">Select a message</h2>
			<p class="mt-2 text-sm text-muted">
				Choose a message from your inbox to see the sender, sent date, tournament, and full contents here.
			</p>
		</div>
	</section>
{/if}
</div>
<style>
	.message-reader-body :global(a) {
		text-decoration: underline;
		word-break: break-word;
	}

	.message-reader-body :global(p) {
		margin-bottom: 0.75rem;
	}

	.message-reader-body :global(ul),
	.message-reader-body :global(ol) {
		margin: 0.75rem 0;
		padding-left: 1.25rem;
	}

	.message-reader-body :global(blockquote) {
		border-left: 3px solid rgb(203 213 225);
		color: rgb(71 85 105);
		padding-left: 0.75rem;
	}
</style>