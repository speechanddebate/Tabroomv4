<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { faker } from '@faker-js/faker';
	import type { QuizOutput } from '$indexcards/schemas';
	import ParadigmCertification from '../../../../routes/paradigms/[id]/Quiz.svelte';

	const { Story } = defineMeta({
		component: ParadigmCertification,
	});
	const quiz: QuizOutput = {
		id: faker.number.int(),
		tag: faker.lorem.word(),
		label: faker.lorem.words(3),
		description: faker.lorem.paragraph(),
		sitewide: 1,
		hidden: 0,
		approval: 1,
		show_answers: 0,
		admin_only: 0,
		circuit:null,
		Badge: {
			altText: faker.lorem.words(3),
			link: faker.internet.url(),
			imageUrl: faker.image.url({ width: 100, height: 100 }),
		},
		PersonQuizzes: [{
			id: faker.number.int(),
			person: faker.number.int(),
			quiz: faker.number.int(),
			pending: 0,
			approvedBy: 12,
			updatedAt: faker.date.past().toISOString(),
		}],
	};
	</script>

	<Story
	name="Paradigm | Default"
	args={{
		variant: 'paradigm',
		quiz,
	}}
	/>
	<Story
	name="Paradigm | No badge"
	args={{
		variant: 'paradigm',
		quiz: {
			...quiz,
			Badge: {
				altText: null,
				link: null,
				imageUrl: null,
			},
		},
	}}
	/>
	<Story
	name="Paradigm | No updatedAt"
	args={{
		variant: 'paradigm',
		quiz: {
			...quiz,
			PersonQuizzes: [],
		},
	}}
	/>
	<Story
	name="Person | Not Taken"
	args={{
		variant: 'self',
		quiz: {
			...quiz,
			PersonQuizzes: [],
		},
	}}
	/>
	<Story
	name="Person | Taken"
	args={{
		variant: 'self',
		quiz,
	}}
	/>