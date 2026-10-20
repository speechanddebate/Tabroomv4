<script lang='ts' module>
	import type { UtilityRoom } from '@tabroom/types';

	// The room to join. Utility rooms come from the tourn's room list, so they need no lookup
	export type OnlineRoomTarget =
		| { type: 'section', tournId: number, sectionId: number, observer?: number }
		| { type: 'school', tournId: number, schoolId: number }
		| { type: 'entry', tournId: number, entryId: number }
		| { type: 'utility', tournId: number, room: UtilityRoom };
</script>

<script lang='ts'>
	import { tick } from 'svelte';
	import { Video } from '@lucide/svelte';
	import type { OnlineRoom, OnlineRoomJoin } from '@tabroom/types';
	import {
		createRestTournsPrepRoomsGet,
		createRestTournsPrepRoomsJoin,
		createRestTournsRoomJoin,
		createRestTournsSchoolsRoomGet,
		createRestTournsSchoolsRoomJoin,
		createRestTournsSectionsRoomGet,
		createRestTournsSectionsRoomJoin,
	} from '$indexcards';
	import Button from '$lib/components/Button.svelte';
	import { handleMutation } from '$lib/helpers/query';

	// The join button for a room that can be joined online. Renders nothing otherwise (in person, closed,
	// no room, still loading): the caller shows the room
	type Props = {
		target: OnlineRoomTarget;
		// icon: an icon-only join button. text: a join button with the icon and "Join {name}"
		variant?: 'icon' | 'text';
	};

	let { target, variant = 'icon' }: Props = $props();

	// Only the query for the target's type runs
	const sectionQuery = createRestTournsSectionsRoomGet(
		() => (target.type === 'section' ? target.tournId : 0),
		() => (target.type === 'section' ? target.sectionId : 0),
		() => (target.type === 'section' && target.observer ? { observer: target.observer } : {}),
		() => ({ query: { enabled: target.type === 'section' } }),
	);
	const schoolQuery = createRestTournsSchoolsRoomGet(
		() => (target.type === 'school' ? target.tournId : 0),
		() => (target.type === 'school' ? target.schoolId : 0),
		() => ({ query: { enabled: target.type === 'school' } }),
	);
	const prepQuery = createRestTournsPrepRoomsGet(
		() => (target.type === 'entry' ? target.tournId : 0),
		() => (target.type === 'entry' ? target.entryId : 0),
		() => ({ query: { enabled: target.type === 'entry' } }),
	);

	const sectionJoin = createRestTournsSectionsRoomJoin();
	const schoolJoin = createRestTournsSchoolsRoomJoin();
	const prepJoin = createRestTournsPrepRoomsJoin();
	const utilityJoin = createRestTournsRoomJoin();

	const query = $derived(
		target.type === 'section' ? sectionQuery
		: target.type === 'school' ? schoolQuery
		: target.type === 'entry' ? prepQuery
		: null,
	);

	// A missing room (404) isn't an error here: there's just no button
	const room: OnlineRoom | null = $derived(
		target.type === 'utility' ? target.room
		: query?.data?.status === 200 ? query.data.data
		: null,
	);
	const name = $derived(room?.name ?? 'room');

	// The window a join opens in, named so the Campus form can post into it
	const windowName = $props.id();
	let joining = $state(false);
	let campus = $state<{ url: string, token: string } | null>(null);
	let campusForm = $state<HTMLFormElement>();

	function mutate() {
		switch (target.type) {
			case 'section':
				return sectionJoin.mutateAsync({
					tournId: target.tournId,
					sectionId: target.sectionId,
					params: target.observer ? { observer: target.observer } : undefined,
				});
			case 'school':
				return schoolJoin.mutateAsync({ tournId: target.tournId, schoolId: target.schoolId });
			case 'entry':
				return prepJoin.mutateAsync({ tournId: target.tournId, entryId: target.entryId });
			case 'utility':
				return utilityJoin.mutateAsync({ tournId: target.tournId, roomId: target.room.id, data: { name: target.room.name ?? '' } });
		}
	}

	async function join() {
		// Open the window during the click, before awaiting the join, so popup blockers allow it
		const win = window.open('', windowName);
		joining = true;
		const joined: OnlineRoomJoin | null = await handleMutation(mutate());
		joining = false;

		if (!joined) {
			win?.close();
			return;
		}

		if (win) win.opener = null;

		if (joined.token) {
			// Campus takes the signed token as a form post. Without a window, it opens here
			campus = { url: joined.url, token: joined.token };
			await tick();
			campusForm?.setAttribute('target', win ? windowName : '_self');
			campusForm?.submit();
		} else if (win) {
			win.location.href = joined.url;
		} else {
			window.location.href = joined.url;
		}
	}
</script>

{#if room?.joinable && variant === 'text'}
	<Button
		color    = 'primary'
		disabled = {joining}
		onclick  = {join}
		size     = 'sm'
		variant  = 'outline'
	>
		<Video size='16' />
		Join {name}
	</Button>
{:else if room?.joinable}
	<Button
		color    = 'primary'
		disabled = {joining}
		label    = 'Join {name}'
		onclick  = {join}
		size     = 'sm'
		variant  = 'outline'
	>
		<Video size='16' />
	</Button>
{/if}

{#if campus}
	<form bind:this={campusForm} class='hidden' action={campus.url} method='post'>
		<input name='json' type='hidden' value={campus.token} />
	</form>
{/if}
