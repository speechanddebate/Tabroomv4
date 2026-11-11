import { sql } from 'kysely';
import { db as kdb } from '../data/database.js';
import { fetchNSDA } from '../services/nsda/fetchNSDA.js';
import { getMemberByEmail } from '../services/nsda/members.js';

// The older callers in this file expect a failed request back as an object, not thrown.
// New code calls fetchNSDA itself
export const getNSDA  = async (path) => {

	try {
		return await fetchNSDA(path);

	} catch (err) {
		return {
			error: true,
			message : `Error caught on fetch: ${err}`,
		};
	}
};

export const syncLearnResults = async (person) => {

	let targetPerson = {};
	const nsdaIds = {};

	if (typeof person === 'number') {
		targetPerson = await kdb.selectFrom('person')
			.selectAll()
			.where('id', '=', person)
			.executeTakeFirst();
	} else if (typeof person === 'object') {
		targetPerson = person;
	}

	if ( !targetPerson ) {
		return 'Learn courses may only be synced to valid Tabroom accounts';
	}

	if ( targetPerson.nsda ) {
		nsdaIds[targetPerson.nsda] = true;
	} else {
		// A search that fails finds no one, as it always has here
		const member = await getMemberByEmail(targetPerson.email).catch(() => null);
		if (member) {
			targetPerson.nsda = member.id;
			await kdb.updateTable('person')
				.set({ nsda: member.id })
				.where('id', '=', targetPerson.id)
				.execute();
		}
	}

	const { rows: nsdaIdentities } = await sql`
		select nsda_id.value nsda_id,
			nsda_email.value nsda_email
		from person
			left join person_setting nsda_email on nsda_email.person = person.id and nsda_email.tag = 'nsda_email'
			left join person_setting nsda_id on nsda_id.person = person.id and nsda_id.tag = 'nsda_id'
		where 1=1
			and person.id = ${targetPerson.id}
	`.execute(kdb);

	if (nsdaIdentities && nsdaIdentities[0].nsda_email) {
		const member = await getMemberByEmail(nsdaIdentities[0].nsda_email).catch(() => null);
		if (member && member.id !== targetPerson.nsda) {
			nsdaIds[member.id] = true;
		}
	}

	if (nsdaIdentities && nsdaIdentities[0].nsda_id) {
		nsdaIds[nsdaIdentities[0].nsda_id] = true;
	}

	const learnResults = [];

	for (const nsdaId of Object.keys(nsdaIds)) {
		const path = `/members/${nsdaId}/learn`;
		const learn = await getNSDA(path);
		learnResults.push(...learn);
	}

	if (!learnResults.length > 0) {
		return `User ${targetPerson.nsda} does not have any completed NSDA Learn courses.`;
	}

	const { rows: existingQuizzes } = await sql`
		select
			quiz.id, quiz.nsda_course,
			pq.id pqId,
			pq.pending, pq.approved_by, pq.completed, pq.updated_at
		from quiz
			left join person_quiz pq on pq.quiz = quiz.id and pq.person = ${targetPerson.id}
		where 1=1
			and quiz.nsda_course > 0
	`.execute(kdb);

	const quizByNSDA  = {};

	for (const quiz of existingQuizzes) {
		quizByNSDA[quiz.nsda_course] = quiz;
	}

	const results = {
		updates : 0,
		new     : 0,
	};

	for (const result of learnResults) {

		if (result.status === 'completed') {
			if (quizByNSDA[result.courseId]?.pqId) {

				if (!quizByNSDA[result.courseId].approved_by) {

					await kdb.updateTable('person_quiz')
						.set({ pending: 0, completed: 1, approved_by: 3 })
						.where('id', '=', quizByNSDA[result.courseId].pqId)
						.execute();
					results.updates++;
				}

			} else if (quizByNSDA[result.courseId]) {

				await kdb.insertInto('person_quiz').values({
					person      : targetPerson.id,
					approved_by : 3,
					quiz        : quizByNSDA[result.courseId].id,
					completed   : 1,
					updated_at  : new Date(),
				}).execute();

				results.new++;
			}
		}
	}

	return {
		message : `I have updated ${results.new} new quizzes and ${results.updates} existing ones`,
		...results,
	};

};

export default getNSDA;
