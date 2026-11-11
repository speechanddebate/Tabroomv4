import type { Insertable } from 'kysely';
import config from '../../../config.js';
import { db } from '../../../data/database.js';
import type { PersonQuiz } from '../../../data/schema.js';
import logger from '../../../helpers/logger.js';
import personQuizRepo from '../../../repos/personQuizRepo.js';
import personRepo from '../../../repos/personRepo.js';
import quizRepo from '../../../repos/quizRepo.js';
import tabroomRepo from '../../../repos/tabroomRepo.js';
import { getLearnCompletions, type LearnCompletion } from '../../nsda/learn.js';
import { getMember, getMemberByEmail, type Member } from '../../nsda/members.js';
import { defineQueue, type QueueScheduler } from '../define.js';

// The person a quiz completed on NSDA Learn is approved by
export const LEARN_APPROVER = 3;

/** A Tabroom account with what ties it to the NSDA */
type Account = Awaited<ReturnType<typeof personRepo.getNsdaLinks>>[number];

const secondIdOf = (account: Account) => Number(account.settings?.nsda_id) || null;
const secondEmailOf = (account: Account) => (typeof account.settings?.nsda_email === 'string' ? account.settings.nsda_email.toLowerCase() : null);

/**
 * How accounts are reconciled with what Learn reports, kept apart from updating the course.
 * Ported from masoncards' syncLearnByCourse; it is not really the Learn sync's business and
 * is here only until it has a home of its own. For each account, as masoncards did:
 * - Its email matches a completer whose NSDA id is neither its main id nor its second: look
 *   both members up at the NSDA and compare names. Its own id is not a member at all: switch
 *   to the completer's id if its first and last name both match, otherwise remove the id. Its own
 *   id belongs to someone with a different first and last name: switch if the completer's
 *   first and last both match, otherwise remove it. Otherwise leave it alone.
 * - Its email matches a completer and it has no NSDA id: give it the completer's.
 * - Its NSDA id matches a completer whose email is not one of its own: keep that email as
 *   its second email, and keep any member the NSDA has under its main email as its second id.
 * Second ids and emails are only added where the account has none.
 * Unlike masoncards, a member lookup that fails changes nothing: masoncards read the failure
 * as a name mismatch and switched or removed the id. And it covers every account that
 * matches, not only those that already have a row for the quiz.
 * Returns the lines masoncards kept as the quiz's log
 */
export async function reconcileLearnAccounts(completions: LearnCompletion[], accounts: Account[]) {
	const byNsdaId = new Map(completions.map((completion) => [completion.person_id, completion]));
	const byEmail = new Map(completions.map((completion) => [completion.email.toLowerCase(), completion]));
	const logs: string[] = [];
	const now = new Date();

	for (const person of accounts) {
		const secondId = secondIdOf(person);
		const sameEmail = byEmail.get(person.email.toLowerCase());

		// The email matches a completion, but neither of the account's NSDA ids matches it.
		if (sameEmail && person.nsda && person.nsda !== sameEmail.person_id && secondId && secondId !== sameEmail.person_id) {
			logs.push(`${now}: NSDA ID Mismatch: Same email ${sameEmail.email}. Tabroom NSDA: ${person.nsda} Second ${secondId} and NSDA ID: ${sameEmail.person_id}`);
			let tabroomMember: Member | null;
			let learnMember: Member | null;
			try {
				tabroomMember = await getMember(person.nsda);
				learnMember = await getMember(sameEmail.person_id);
			} catch (error) {
				logger.warn(`Could not look up NSDA members to reconcile person ${person.id}; left as it is`, { 'event.name': 'job.learn-course-sync.member_lookup.exception', person: person.id, error });
				continue;
			}

			if (!tabroomMember) {
				if (learnMember?.last === person.last && learnMember?.first === person.first) {
					logs.push(`${now}: NSDA ID ${person.nsda} is invalid. Name match so switching to valid NSDA ID ${sameEmail.person_id}`);
					await personRepo.setNsdaId(db, person.id, sameEmail.person_id, `NSDA Learn unlinked invalid NSDA ID ${person.nsda}.  Switched to ${sameEmail.person_id}`);
				} else {
					logs.push(`${now}: NSDA ID ${person.nsda} is invalid. No name match, unlinking`);
					await personRepo.setNsdaId(db, person.id, null, `NSDA Learn unlinked from invalid NSDA ID ${person.nsda}`);
				}
			} else if (tabroomMember.last !== person.last && tabroomMember.first !== person.first) {
				if (learnMember?.last === person.last && learnMember?.first === person.first) {
					await personRepo.setNsdaId(db, person.id, sameEmail.person_id, `NSDA Learn unlinked from ${person.nsda} due to name and ID mismatch.  Switched to ${sameEmail.person_id}`);
				} else {
					await personRepo.setNsdaId(db, person.id, null, `NSDA Learn unlinked from ${person.nsda} due to name and ID mismatch`);
				}
			}
		// The email matches a completion and the account has no NSDA id.
		} else if (sameEmail && !person.nsda) {
			logs.push(`${now} Linked Tabroom ${person.email} to NSDA ID: ${sameEmail.person_id}`);
			await personRepo.setNsdaId(db, person.id, sameEmail.person_id, `NSDA Learn linked user to ${sameEmail.person_id} because of email match`);
		}

		const sameId = (person.nsda ? byNsdaId.get(person.nsda) : undefined) ?? (secondId ? byNsdaId.get(secondId) : undefined);
		const learnEmail = sameId?.email.toLowerCase();
		if (sameId && learnEmail !== person.email.toLowerCase() && learnEmail !== secondEmailOf(person)) {
			logs.push(`${now}: Email Mismatch: NSDA ID: ${person.nsda} belongs to Tabroom email ${person.email} and NSDA email ${sameId.email}`);

			// Only where the account has none, going by what was loaded; a second email or id set since then would be replaced
			const settings: Record<string, string> = secondEmailOf(person) ? {} : { nsda_email: sameId.email };
			if (!secondId) {
				// See if the primary Tabroom email also has an ID number and stash that too
				// A search that fails finds no one, as it did in masoncards
				const member = await getMemberByEmail(person.email).catch(() => null);
				if (member) settings.nsda_id = String(member.id);
			}
			if (Object.keys(settings).length) await personRepo.updatePerson(db, person.id, { settings });
		}
	}

	return logs;
}

/**
 * How a Learn course is updated: each account that has completed it is marked as having done
 * the quiz, completed and approved. An account with no row for the quiz gets one, dated with
 * the Learn completion; one whose rows are all unapproved has them approved in place; one
 * with an approved row is left alone. Unlike masoncards, which deleted and re-created rows,
 * nothing is deleted. An account can have two rows for a quiz, so any approved row counts
 */
export async function updateLearnCourse(quiz: number, completedBy: Map<number, LearnCompletion>) {
	const rowsByPerson = new Map<number, Awaited<ReturnType<typeof personQuizRepo.getPersonQuizStatuses>>>();
	for (const row of await personQuizRepo.getPersonQuizStatuses(db, { quiz })) {
		rowsByPerson.set(row.person, [...(rowsByPerson.get(row.person) ?? []), row]);
	}

	const toAdd: Insertable<PersonQuiz>[] = [];
	const toApprove: number[] = [];
	for (const [person, completion] of completedBy) {
		const rows = rowsByPerson.get(person) ?? [];
		if (!rows.length) {
			// Learn sends a date and time with no zone; read as UTC, as masoncards' container did
			toAdd.push({ person, quiz, completed: 1, pending: 0, approved_by: LEARN_APPROVER, updated_at: new Date(`${completion.completed.replace(' ', 'T')}Z`) });
		} else if (!rows.some((row) => row.completed && row.approved_by)) {
			toApprove.push(...rows.map((row) => row.id));
		}
	}

	await personQuizRepo.createPersonQuizzes(db, toAdd);
	if (toApprove.length) await personQuizRepo.approvePersonQuizzes(db, toApprove, LEARN_APPROVER);
	return { added: toAdd.length, approved: toApprove.length };
}

/**
 * Syncs one quiz with its NSDA Learn course, as masoncards' syncLearnByCourse did: find the
 * Tabroom accounts of the people Learn says completed it, by NSDA id (main or second) or by
 * email (main or second), reconcile those accounts, mark the quiz done for them, and leave
 * the record classic's quiz log page reads: the completions that matched no account in
 * quiz_misses_<quiz> and the reconcile's lines in quiz_log_<quiz>, each replacing the last run's
 */
export async function syncLearnByCourse(quiz: { id: number, label: string | null, nsda_course: number | null }) {
	const completions = await getLearnCompletions(Number(quiz.nsda_course));
	const ids = completions.map((completion) => completion.person_id);
	const emails = completions.map((completion) => completion.email.toLowerCase());

	// One statement holds at most 65,535 values, well above the largest course today
	const found = await Promise.all([
		personRepo.getNsdaLinks(db, { nsdaIds: ids }),
		personRepo.getNsdaLinks(db, { emails }),
		personRepo.getPersonIdsBySetting(db, 'nsda_id', ids.map(String)).then((people) => personRepo.getNsdaLinks(db, { ids: people })),
		personRepo.getPersonIdsBySetting(db, 'nsda_email', emails).then((people) => personRepo.getNsdaLinks(db, { ids: people })),
	]);
	const accounts = [...new Map(found.flat().map((account) => [account.id, account])).values()];

	const logs = await reconcileLearnAccounts(completions, accounts);

	const byNsdaId = new Map(completions.map((completion) => [completion.person_id, completion]));
	const byEmail = new Map(completions.map((completion) => [completion.email.toLowerCase(), completion]));
	const completedBy = new Map<number, LearnCompletion>();
	for (const account of accounts) {
		const completion = byNsdaId.get(account.nsda ?? 0) ?? byNsdaId.get(secondIdOf(account) ?? 0)
			?? byEmail.get(account.email.toLowerCase()) ?? byEmail.get(secondEmailOf(account) ?? '');
		if (completion) completedBy.set(account.id, completion);
	}
	const updated = await updateLearnCourse(quiz.id, completedBy);

	// A miss matches no account at all. Two completions can share an id or an email, so one
	// that was not the completion picked for its account is not a miss
	const accountIds = new Set(accounts.flatMap((account) => [account.nsda, secondIdOf(account)]));
	const accountEmails = new Set(accounts.flatMap((account) => [account.email.toLowerCase(), secondEmailOf(account)]));
	const misses = completions.filter((completion) => !accountIds.has(completion.person_id) && !accountEmails.has(completion.email.toLowerCase()));
	await tabroomRepo.saveSetting(db, `quiz_misses_${quiz.id}`, misses, LEARN_APPROVER);
	await tabroomRepo.saveSetting(db, `quiz_log_${quiz.id}`, logs, LEARN_APPROVER);

	logger.info(`${quiz.label} synchronized for ${completions.length} records with ${logs.length} changes`, {
		'event.name': 'job.learn-course-sync.course.synced',
		quiz: quiz.id,
		completions: completions.length,
		misses: misses.length,
		...updated,
	});
	return { completions: completions.length, misses: misses.length, ...updated };
}

/** The NSDA Learn course sync: every quiz tied to a Learn course, all at once, as masoncards' cron script ran them */
export async function syncLearnCourses() {
	const quizzes = await quizRepo.getQuizzes(db, { learnCourse: true });
	const synced = await Promise.all(quizzes.map(syncLearnByCourse));

	const total = { courses: quizzes.length, completions: 0, added: 0, approved: 0, misses: 0 };
	for (const course of synced) {
		total.completions += course.completions;
		total.added += course.added;
		total.approved += course.approved;
		total.misses += course.misses;
	}
	return total;
}

export const learnCourseSyncSchedule: QueueScheduler<Record<string, never>> = {
	id: 'learn-course-sync',
	description: 'Pulls NSDA Learn course completions into judge quizzes',
	repeat: { every: 30 * 60 * 1000 }, // every 30 minutes
	job: { name: 'learn-course-sync', data: {} },
	enabled: () => config.jobs.learnCourseSync.enabled,
};

export const learnCourseSyncQueue = defineQueue({
	name: 'learn-course-sync',
	processor: syncLearnCourses,
	globalConcurrency: 1,
	removeOnComplete: { count: 100 },
	removeOnFail: { count: 100 },
	schedulers: [learnCourseSyncSchedule],
});
