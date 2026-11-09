<script lang='ts' module>
	// Where a join goes. The room itself comes in with the page's data
	export type OnlineRoomTarget =
		| { type: 'section', tournId: number, sectionId: number, observer?: number }
		| { type: 'school', tournId: number, schoolId: number }
		| { type: 'entry', tournId: number, entryId: number }
		| { type: 'utility', tournId: number, roomId: number };
</script>

<script lang='ts'>
	import { tick } from 'svelte';
	import { Video } from '@lucide/svelte';
	import type { OnlineRoomJoin, RoomView } from '@tabroom/types';
	import {
		createRestTournsPrepRoomsJoin,
		createRestTournsRoomJoin,
		createRestTournsSchoolsRoomJoin,
		createRestTournsSectionsRoomJoin,
	} from '$indexcards';
	import Button from '$lib/components/Button.svelte';
	import { handleMutation } from '$lib/helpers/query';

	// The join button for a room that can be joined online. Only render it when room.joinable
	type Props = {
		room: RoomView;
		target: OnlineRoomTarget;
		// icon: an icon-only join button. text: a join button with the icon and text
		variant?: 'icon' | 'text';
		size?: 'sm' | 'md';
		// The text button's text. Defaults to "Join {name}"
		text?: string;
	};

	let { room, target, variant = 'icon', size = 'sm', text }: Props = $props();

	const sectionJoin = createRestTournsSectionsRoomJoin();
	const schoolJoin = createRestTournsSchoolsRoomJoin();
	const prepJoin = createRestTournsPrepRoomsJoin();
	const utilityJoin = createRestTournsRoomJoin();

	const name = $derived(room.name ?? 'room');

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
				return utilityJoin.mutateAsync({ tournId: target.tournId, roomId: target.roomId, data: { name: room.name ?? '' } });
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

{#if variant === 'text'}
	<!-- Custom text is usually just the room, so the accessible name says what the button does -->
	<Button
		aria-label = {text ? `Join ${text}` : undefined}
		color      = 'primary'
		disabled   = {joining}
		onclick    = {join}
		{size}
	>
		<Video size='16' />
		{text ?? `Join ${name}`}
	</Button>
{:else}
	<Button
		color    = 'primary'
		disabled = {joining}
		label    = 'Join {name}'
		onclick  = {join}
		{size}
	>
		<Video size='16' />
	</Button>
{/if}

{#if campus}
	<form bind:this={campusForm} class='hidden' action={campus.url} method='post'>
		<input name='json' type='hidden' value={campus.token} />
	</form>
{/if}
