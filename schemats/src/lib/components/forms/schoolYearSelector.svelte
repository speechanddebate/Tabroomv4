<script lang="ts">
/**
 *  a dropdown to select a school year, which is then used to filter results on the page.
 *  The value is a string in the format "YYYY-YYYY", representing the start and end years of the school year.
*/
	import { SvelteDate } from 'svelte/reactivity';
	import Select from './Select.svelte';

	type Props = {
		value?: string,
		oldestYear?: number,
		// For a page whose heading already says "School year"
		hideLabel?: boolean,
	};

	const now = new SvelteDate();
	const currentSchoolYearStart =
		now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

	let {
		value = $bindable(`${currentSchoolYearStart}-${currentSchoolYearStart + 1}`),
		oldestYear = 2011,
		hideLabel = false,
	}: Props = $props();

	const options = $derived(
		Array.from(
			{ length: currentSchoolYearStart - oldestYear + 1 },
			(_, index) => {
				const start = currentSchoolYearStart - index;
				return { value: `${start}-${start + 1}`, label: `${start}-${start + 1}` };
			},
		),
	);
</script>

<Select {hideLabel} label="School year" {options} bind:value />
