<script lang="ts">
	import { Toast as FlowbiteToast } from 'flowbite-svelte';
	import type { ToastSeverity } from '$lib/helpers/toasts';

	let {
		message,
		detail,
		severity,
		visible = true,
		onclose,
	}: {
		message: string;
		detail?: string;
		severity?: ToastSeverity;
		visible?: boolean;
		onclose?: () => void;
	} = $props();

	function severityToColor(toastSeverity: ToastSeverity | undefined): 'blue' | 'yellow' | 'red' | 'green' {
		switch (toastSeverity) {
			case 'warning':
				return 'yellow';
			case 'error':
				return 'red';
			case 'success':
				return 'green';
			default:
				return 'blue';
		}
	}

	function severityToBorderClass(toastSeverity: ToastSeverity | undefined): string {
		switch (toastSeverity) {
			case 'warning':
				return 'border-l-4 border-warning';
			case 'error':
				return 'border-l-4 border-danger';
			case 'success':
				return 'border-l-4 border-success';
			default:
				return 'border-l-4 border-primary-strong';
		}
	}
</script>

<FlowbiteToast
	class={`w-80 ${severityToBorderClass(severity)}`}
	color={severityToColor(severity)}
	dismissable={true}
	onclose={onclose}
	toastStatus={visible}
>
	<div class="flex flex-col gap-1 text-text">
		<p class="text-sm font-semibold">{message}</p>
		{#if detail}
			<p class="text-sm opacity-90">{detail}</p>
		{/if}
	</div>
</FlowbiteToast>
