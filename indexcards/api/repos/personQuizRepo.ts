import type { Database } from '../data/database.js';
import type { PersonQuiz } from '../data/schema.js';
import type { Insertable } from 'kysely';

type queryOpts = {
	/** only one quiz's rows */
	quiz?: number;
	limit?: number;
	offset?: number;
}
function buildPersonQuizQuery(db: Database, opts: queryOpts = {}) {

	let query = db.selectFrom('person_quiz');

	if (opts.quiz) query = query.where('person_quiz.quiz', '=', opts.quiz);

	if (opts.limit) query = query.limit(Number(opts.limit));

	if (opts.offset) query = query.offset(Number(opts.offset));

	return query;
}

async function getPersonQuiz(db: Database,id:number, opts: queryOpts = {}) {
	return await buildPersonQuizQuery(db, opts).where('id', '=', id).executeTakeFirst();
}

/**
 * Where each person stands on a quiz: one line per person_quiz row, without the answers,
 */
async function getPersonQuizStatuses(db: Database, opts: queryOpts = {}) {
	return await buildPersonQuizQuery(db, opts)
		.select(['person_quiz.id', 'person_quiz.person', 'person_quiz.quiz', 'person_quiz.completed', 'person_quiz.pending', 'person_quiz.approved_by'])
		.execute();
}

async function createPersonQuiz(db: Database, data: Insertable<PersonQuiz>) {
	return await db.insertInto('person_quiz')
	.values(data)
	.returningAll()
	.executeTakeFirstOrThrow();
}

async function createPersonQuizzes(db: Database, data: Insertable<PersonQuiz>[]) {
	if (!data.length) return;
	await db.insertInto('person_quiz').values(data).execute();
}

/** Marks rows completed and approved by the given person, leaving their answers and updated_at as they are */
async function approvePersonQuizzes(db: Database, ids: number[], approvedBy: number) {
	await db.updateTable('person_quiz')
		.set({ completed: 1, pending: 0, approved_by: approvedBy })
		.where('person_quiz.id', 'in', ids)
		.execute();
}

export default {
	createPersonQuiz,
	createPersonQuizzes,
	approvePersonQuizzes,
	getPersonQuiz,
	getPersonQuizStatuses,
};
