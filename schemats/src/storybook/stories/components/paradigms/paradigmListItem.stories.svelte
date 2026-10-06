<script lang="ts" module>
	import { faker } from '@faker-js/faker';
	import type {  ParadigmSearchResult } from '$indexcards/schemas';
	import { getRestParadigmsResponseMock } from '$indexcards/index.msw';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ParadigmListItem from '../../../../routes/paradigms/[id]/paradigmListItem.svelte';

	const generateFakeData = (): ParadigmSearchResult=> ({
		...getRestParadigmsResponseMock()[0],
		name: faker.person.fullName(),
		tournJudged: faker.number.int({ min: 0, max: 150 }),
	});

	const { Story } = defineMeta({
		component: ParadigmListItem,
		args: {
			item: generateFakeData(),
		},
	});
</script>

<Story
	name="Default"
/>