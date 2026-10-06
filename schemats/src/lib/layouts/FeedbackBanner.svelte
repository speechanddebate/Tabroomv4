<script lang="ts">
	import { MessageSquare } from '@lucide/svelte';

	const FORM_URL = 'https://forms.gle/cowWWVpjgLoqMztC9';
</script>

<div
	class='flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-sm text-text'
	aria-label='Feedback'
	role='region'
>
	<MessageSquare class='size-4 shrink-0' aria-hidden='true' />
	<p class='pb-0'>
		You're using the new Tabroom beta.
		<a
			class='font-semibold underline hover:text-primary-deep'
			href={FORM_URL}
			rel='noopener noreferrer'
			target='_blank'
		>Tell us what you think</a>.
	</p>
</div>
