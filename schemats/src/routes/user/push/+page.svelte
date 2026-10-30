<script lang="ts">
	import { onMount } from 'svelte';
	import { useQueryClient } from '@tanstack/svelte-query';
	import {
		createUserNotifyPush,
		createUserNotifyPushSubscribe,
		createUserNotifyPushUnsubscribe,
		createUserNotifyPushUnsubscribeSession,
		createUserSessions,
		getUserNotifyPushQueryKey,
		getUserSessionsQueryKey,
	} from '$indexcards';
	import type { UserSession } from '$indexcards/schemas';
	import Button from '$lib/components/Button.svelte';
	import { showDateTime } from '$lib/helpers/dt';
	import { handleMutation, handleOrval } from '$lib/helpers/query';
	import { getPerson, isSuSession } from '$lib/helpers/SessionContext.svelte';
	import { toast } from '$lib/helpers/toasts';
	import {
		getBrowserSubscription,
		isPushSupported,
		subscribeBrowser,
		syncPush,
		unsubscribeBrowser,
		type SyncResult,
	} from '$lib/helpers/webpush';

	type Permission = NotificationPermission | 'unsupported';

	const queryClient = useQueryClient();
	const pushQuery = createUserNotifyPush();
	const sessionsQuery = createUserSessions();
	const subscribeMutation = createUserNotifyPushSubscribe();
	const unsubscribeMutation = createUserNotifyPushUnsubscribe();
	const unsubscribeSessionMutation = createUserNotifyPushUnsubscribeSession();

	// All null until mounted, so the server render doesn't guess the browser's state
	let permission = $state<Permission | null>(null);
	let syncResult = $state<SyncResult | 'error' | null>(null);
	let syncing = $state(false);
	let working = $state(false);
	// The endpoint of this browser's own push subscription, from the PushManager
	let browserEndpoint = $state<string | null>(null);

	const suLocked = $derived(isSuSession());
	const tz = $derived(getPerson()?.tz ?? undefined);

	const readPermission = (): Permission => {
		if (!isPushSupported()) {
			return 'unsupported';
		}
		return Notification.permission;
	};

	const readBrowserSubscription = async () => {
		if (!isPushSupported()) {
			browserEndpoint = null;
			return;
		}
		const browserSubscription = await getBrowserSubscription();
		browserEndpoint = browserSubscription?.json.endpoint ?? null;
	};

	const hostOf = (endpoint: string | null | undefined) => {
		if (!endpoint) {
			return null;
		}
		try {
			return new URL(endpoint).hostname;
		} catch {
			return null;
		}
	};

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: getUserNotifyPushQueryKey() }),
			queryClient.invalidateQueries({ queryKey: getUserSessionsQueryKey() }),
		]);
	};

	/** Runs a browser push step, turning a thrown browser error into a toast */
	const attempt = async (label: string, step: () => Promise<void>) => {
		working = true;
		try {
			await step();
		} catch (err) {
			console.error(`${label} failed`, err);
			toast.error({ message: `${label} failed`, detail: err instanceof Error ? err.message : String(err) });
		} finally {
			working = false;
			permission = readPermission();
		}
	};

	const runSync = async () => {
		syncing = true;
		try {
			syncResult = await syncPush();
		} catch (err) {
			console.error('Push sync failed', err);
			syncResult = 'error';
		} finally {
			syncing = false;
		}
		permission = readPermission();
		await readBrowserSubscription().catch(() => undefined);
		await refresh();
	};

	onMount(() => {
		permission = readPermission();
		// The page-load sync from the client contract. su'd sessions can't save a subscription
		if (suLocked) {
			void readBrowserSubscription().catch(() => undefined);
		} else {
			void runSync();
		}
	});

	const unavailable = $derived(pushQuery.data?.status === 503);

	const status = $derived(handleOrval(pushQuery, {
		Problem: (problem, callDefault) => {
			// 503 means push isn't configured on the server; the page says so instead of a toast
			if (problem.status !== 503) {
				callDefault(problem);
			}
		},
	}));

	const sessions = $derived(handleOrval(sessionsQuery) ?? []);

	const loginState = $derived.by(() => {
		if (!status) {
			return null;
		}
		if (status.disabled) {
			return 'off';
		}
		return status.endpoint ? 'subscribed' : 'none';
	});

	const serverHost = $derived(hostOf(status?.endpoint));
	const browserHost = $derived(hostOf(browserEndpoint));
	const browserMatches = $derived(Boolean(browserEndpoint) && browserEndpoint === status?.endpoint);
	// The server only reports an endpoint saved under its current key, so a browser
	// subscription it doesn't report usually means the key rotated
	const keyRotated = $derived(Boolean(status && !status.endpoint && !status.disabled && browserEndpoint));

	const busy = $derived(
		working
		|| syncing
		|| subscribeMutation.isPending
		|| unsubscribeMutation.isPending
		|| unsubscribeSessionMutation.isPending
	);
	const canSubscribe = $derived(permission !== 'denied' && permission !== 'unsupported');
	// The server still lists a subscription but this browser no longer allows notifications,
	// so that subscription is dead until the person subscribes again
	const permissionReset = $derived(loginState === 'subscribed' && permission !== null && permission !== 'granted');

	const syncMessages: Record<SyncResult | 'error', string> = {
		'subscribed': 'This browser\'s subscription is saved to this login.',
		'off': 'Push is turned off for this login, so this browser\'s subscription was removed.',
		'no-permission': 'Notifications aren\'t allowed in this browser, so nothing was synced.',
		'reset': 'Notifications were reset in this browser, so its old subscription was removed from this login.',
		'unavailable': 'The server didn\'t take this browser\'s subscription.',
		'unsupported': 'This browser doesn\'t support push notifications.',
		'error': 'The browser couldn\'t sync its push subscription. Check the console for details.',
	};

	const subscribe = () => attempt('Subscribing', async () => {
		if (!status) {
			return;
		}
		const browserSubscription = await subscribeBrowser(status.publicKey);
		if (!browserSubscription) {
			// permission denied or dismissed; the permission row explains how to unblock
			return;
		}
		await handleMutation(subscribeMutation.mutateAsync({
			data: { subscription: browserSubscription.json, enable: true },
		}));
		await readBrowserSubscription();
		await refresh();
	});

	const turnOff = () => attempt('Turning off', async () => {
		const result = await handleMutation(unsubscribeMutation.mutateAsync());
		if (result === null) {
			return;
		}
		if (isPushSupported()) {
			await unsubscribeBrowser();
		}
		await readBrowserSubscription();
		await refresh();
	});

	const turnOffSession = async (session: UserSession) => {
		await handleMutation(unsubscribeSessionMutation.mutateAsync({ session: session.id }));
		await queryClient.invalidateQueries({ queryKey: getUserSessionsQueryKey() });
	};

	const formatDate = (dtISO: string | null) => dtISO ? showDateTime({ dtISO, tz }) : '';
</script>

<div class="flex flex-1 flex-col bg-surface-alt">
	<section class="mx-3 mt-3 flex flex-col gap-4 rounded-md border border-border bg-surface px-4 py-3 shadow-sm">
		<p class="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-text" role="note">
			<strong>Developer tool:</strong> this page is for testing push registration and is only available in development.
		</p>

		<h1 class="text-lg font-semibold text-text">Push Notifications</h1>

		<p class="text-sm text-muted">
			Push notifications send Tabroom alerts to this browser. Turning them off applies to
			this login only; other browsers and devices you're logged in on keep their own setting.
		</p>

		{#if unavailable}
			<p class="text-sm text-text">Push notifications are not available right now.</p>
		{:else}
			<dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
				<dt class="font-semibold text-text">This browser</dt>
				<dd class="text-text" data-testid="push-permission">
					{#if permission === 'unsupported'}
						This browser doesn't support push notifications.
					{:else if permission === 'granted'}
						Notifications from Tabroom are allowed.
					{:else if permission === 'denied'}
						Notifications from Tabroom are blocked.
						<span class="block text-muted">
							To unblock them, open your browser's site settings for Tabroom and allow notifications.
						</span>
					{:else if permission === 'default'}
						You haven't been asked to allow notifications yet.
					{/if}
				</dd>

				<dt class="font-semibold text-text">This login</dt>
				<dd class="text-text" data-testid="push-status">
					{#if loginState === 'subscribed'}
						Subscribed{serverHost ? ` through ${serverHost}` : ''}
					{:else if loginState === 'off'}
						Turned off
					{:else if loginState === 'none'}
						Not set up
					{:else if pushQuery.isPending}
						Loading...
					{/if}
				</dd>

				<dt class="font-semibold text-text">Browser subscription</dt>
				<dd class="text-text" data-testid="push-browser">
					{#if browserHost}
						Subscribed through {browserHost}
						<span class="block text-muted">
							{browserMatches ? 'Matches the subscription saved to this login.' : 'Doesn\'t match the subscription saved to this login.'}
						</span>
						{#if keyRotated}
							<span class="block text-muted" data-testid="push-key-rotated">
								The server has no subscription for its current key, so the key may have rotated. Sync now to replace it.
							</span>
						{/if}
					{:else}
						None
					{/if}
				</dd>

				<dt class="font-semibold text-text">Last sync</dt>
				<dd class="text-text" data-testid="push-sync">
					{#if syncing}
						Syncing...
					{:else if syncResult}
						{syncMessages[syncResult]}
					{:else if suLocked}
						Skipped while su'd.
					{:else}
						Not run yet.
					{/if}
				</dd>
			</dl>

			{#if loginState}
				<div class="flex flex-col gap-2">
					<div class="flex flex-wrap gap-2">
						{#if loginState === 'subscribed' && !permissionReset}
							<Button
								color="danger"
								disabled={suLocked || busy}
								onclick={turnOff}
								variant="outline"
							>
								Turn off
							</Button>
						{:else}
							<Button
								color="primary"
								disabled={suLocked || busy || !canSubscribe}
								onclick={subscribe}
							>
								Subscribe
							</Button>
						{/if}
						<Button
							disabled={suLocked || busy}
							onclick={runSync}
							variant="outline"
						>
							Sync now
						</Button>
					</div>
					{#if permissionReset}
						<p class="text-sm text-muted" data-testid="push-reset">
							Notifications were reset in this browser, so this login's subscription no longer works. Subscribe again to resume.
						</p>
					{/if}
					{#if suLocked}
						<p class="text-sm text-muted">Push notifications can't be changed while su'd.</p>
					{/if}
				</div>
			{/if}
		{/if}
	</section>

	{#if !unavailable}
		<section class="mx-3 my-3 flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-3 shadow-sm">
			<h2 class="text-base font-semibold text-text">Your logins</h2>

			{#if sessionsQuery.isPending}
				<p class="text-sm text-muted">Loading...</p>
			{:else if sessions.length === 0}
				<p class="text-sm text-muted">No logins found.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm" data-testid="push-sessions">
						<thead class="border-b border-border text-muted">
							<tr>
								<th class="px-2 py-1 font-semibold" scope="col">Login</th>
								<th class="px-2 py-1 font-semibold" scope="col">Browser</th>
								<th class="px-2 py-1 font-semibold" scope="col">IP address</th>
								<th class="px-2 py-1 font-semibold" scope="col">Last used</th>
								<th class="px-2 py-1 font-semibold" scope="col">Push</th>
								<th class="px-2 py-1 font-semibold" scope="col"><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody>
							{#each sessions as session (session.id)}
								<tr class="border-b border-border last:border-b-0">
									<td class="px-2 py-1 whitespace-nowrap">
										{#if session.current}
											<span class="rounded-full border border-primary px-2 py-0.5 text-xs text-primary">This login</span>
										{:else}
											<span class="text-muted">#{session.id}</span>
										{/if}
									</td>
									<td class="max-w-xs truncate px-2 py-1" title={session.agent ?? ''}>{session.agent ?? ''}</td>
									<td class="px-2 py-1 whitespace-nowrap">{session.ip ?? ''}</td>
									<td class="px-2 py-1 whitespace-nowrap">{formatDate(session.last_access)}</td>
									<td class="px-2 py-1 whitespace-nowrap">
										{#if session.subscribed}
											Subscribed{session.host ? ` through ${session.host}` : ''}
										{:else if session.disabled}
											Turned off
										{:else}
											None
										{/if}
									</td>
									<td class="px-2 py-1 text-right">
										{#if session.subscribed && !session.current}
											<Button
												aria-label={`Turn off push for login ${session.id}`}
												color="danger"
												disabled={suLocked || busy}
												onclick={() => turnOffSession(session)}
												size="sm"
												variant="outline"
											>
												Turn off
											</Button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>
