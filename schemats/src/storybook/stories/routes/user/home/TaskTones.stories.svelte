<script lang="ts" module>
	/*
	 * TaskRow at each level: info (gray), due (primary), alert (yellow),
	 * critical (red). Rows escalate as a deadline nears and passes. homeTasks
	 * doesn't emit every level yet, so the tasks here are written by hand in a
	 * stand-in for TournCard's task well.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TaskRow from '../../../../../routes/user/home/TaskRow.svelte';
	import type { Task } from '../../../../../routes/user/home/tasks';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/Task tones',
		parameters: { layout: 'padded' },
	});

	const card: Task[] = [
		{ tone: 'critical', title: 'Strike card for Round 4', when: 'Was due 20 minutes ago.', detail: 'Late strikes may not count.', action: { label: 'Enter strikes', href: '#strikes' } },
		{ tone: 'alert', title: 'Round 3 LD starts at 10:40 a.m.', detail: 'Room 214. AB vs. CD.', action: { label: 'Start round', href: '#ballot' } },
		{ tone: 'alert', title: 'Check in your school', when: 'Due in 2 hours.', action: { label: 'Check in', href: '#onsite' } },
		{ tone: 'due', title: 'Judge prefs are open for CX', when: 'Due Friday at 5:00 p.m. CT.', detail: '12 entries to pref for.', action: { label: 'Fill in pref sheets', href: '#prefs' } },
		{ tone: 'due', title: '2 student signups to approve', detail: 'Ana Diaz in LD and Ben Wu in PF.', action: { label: 'Review signups', href: '#signups' } },
		{ tone: 'info', title: '3 of 5 questionnaires completed', detail: '2 to complete.' },
		{ tone: 'info', title: 'Registration closes November 13', detail: '8 entries and 3 judges so far.', action: { label: 'Edit entries', href: '#entries' } },
	];

	const escalation: Task[] = [
		{ tone: 'info', title: 'Judge prefs for CX', when: 'Opens Monday, November 10.', action: { label: 'Preview', href: '#info' } },
		{ tone: 'due', title: 'Judge prefs for CX', when: 'Due Friday at 5:00 p.m. CT.', action: { label: 'Fill in pref sheets', href: '#due' } },
		{ tone: 'alert', title: 'Judge prefs for CX', when: 'Due in 3 hours.', action: { label: 'Fill in pref sheets', href: '#alert' } },
		{ tone: 'critical', title: 'Judge prefs for CX', when: 'Was due 2 hours ago.', detail: 'Late prefs may not count.', action: { label: 'Fill in pref sheets', href: '#critical' } },
	];
</script>

{#snippet well(tasks: Task[])}
	<div class="max-w-4xl bg-page p-4">
		<div class="raised overflow-hidden">
			<div class="sunken flex flex-col divide-y divide-border" aria-label="Tasks" role="group">
				{#each tasks as task, idx (idx)}<TaskRow {task} />{/each}
			</div>
		</div>
	</div>
{/snippet}

<Story name="Every level">
	{#snippet template()}{@render well(card)}{/snippet}
</Story>

<Story name="One task escalating">
	{#snippet template()}{@render well(escalation)}{/snippet}
</Story>
