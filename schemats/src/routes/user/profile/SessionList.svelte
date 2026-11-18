<script lang="ts">
	import type { UserSession } from '@tabroom/types';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { createUserSessionEnd, createUserSessions, getUserSessionsQueryKey } from '#indexcards';
	import Button from '#lib/components/Button.svelte';
	import { showDateTime } from '#lib/helpers/dt.ts';
	import { handleMutation, handleOrval } from '#lib/helpers/query.ts';
	import { toast } from '#lib/helpers/toasts.ts';

	type Props = {
		/** The person's time zone, for last active */
		tz: string | null,
	};

	let { tz }: Props = $props();

	// Logins come and go on other devices, so a reload fetches the list fresh
	const sessionsQuery = createUserSessions(() => ({ query: { meta: { persist: false } } }));
	const sessions = $derived((handleOrval(sessionsQuery) ?? []).toSorted((a, b) => Number(b.current) - Number(a.current)));
	const end = createUserSessionEnd();
	const queryClient = useQueryClient();
	let ending: number | null = $state(null);

	const device = (session: UserSession) => {
		if (session.browser && session.os) return `${session.browser} on ${session.os}`;
		return session.browser ?? session.os ?? 'Unknown browser';
	};

	// a 204 resolves to undefined; a problem or a network error resolves to null
	async function endSession(session: UserSession) {
		ending = session.id;
		const ended = await handleMutation(() => end.mutateAsync({ sessionId: session.id }));
		if (ended !== null) toast.success({ message: `Logged out ${device(session)}` });
		await queryClient.invalidateQueries({ queryKey: getUserSessionsQueryKey() });
		ending = null;
	}

	const help = 'text-xs text-muted';
</script>

{#if sessions.length > 0}
	<table class="w-full text-sm" data-testid="sessions">
		<caption class="sr-only">Where you're logged in</caption>
		<thead>
			<tr class="border-b-2 border-border-strong text-left text-xs text-muted">
				<th class="py-1 pr-3 font-semibold" scope="col">Logged in on</th>
				<th class="py-1 pr-3 font-semibold" scope="col">Last active</th>
				<th class="py-1 font-semibold" scope="col"><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody>
			{#each sessions as session (session.id)}
				<tr class="border-b border-border">
					<td class="py-1.5 pr-3">
						<span class="flex flex-col">
							<span>{device(session)}</span>
							{#if session.ip}
								<span class={help}>{session.ip}</span>
							{/if}
						</span>
					</td>
					<td class="py-1.5 pr-3">
						{#if session.last_access}
							{showDateTime({ dtISO: session.last_access, tz: tz ?? undefined, format: 'medium', joinWord: 'at' })}
						{/if}
					</td>
					<td class="py-1.5 text-right">
						{#if session.current}
							<span class="text-xs font-semibold text-muted" title="Log out to end this session">This browser</span>
						{:else}
							<Button
								color="danger"
								disabled={ending !== null}
								onclick={() => endSession(session)}
								size="sm"
								type="button"
								variant="ghost"
							>
								End session <span class="sr-only">on {device(session)}</span>
							</Button>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
