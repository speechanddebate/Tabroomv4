import CryptoJS from 'crypto-js';
import axios from 'axios';
import { sql } from 'kysely';
import { db as kdb } from '../data/database.js';
import changeLogRepo from '../repos/changeLogRepo.js';
import config from '../config.js';

export const getNSDAMemberId = async (email) => {
	const path = `/search?q=${email}&type=members`;
	const memberships = await getNSDA(path);

	if (memberships && memberships[0]?.id) {
		return {
			id    : memberships[0].id,
			first : memberships[0].last,
			last  : memberships[0].first,
		};
	}
};

export const getNSDA  = async (path) => {

	const uri = `${config.nsda.endpoint}${config.nsda.path}${path}`;
	const words = CryptoJS.enc.Utf8.parse(`${config.nsda.user_id}:${config.nsda.key}`);
	const authToken = CryptoJS.enc.Base64.stringify(words);

	try {
		const response = await axios.get(
			uri,
			{
				headers : {
					Authorization  : `Basic ${authToken}`,
					'Content-Type' : 'application/json',
					Accept         : 'application/json',
				},
			},
		);

		return response.data;

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
		const membership = await getNSDAMemberId(targetPerson.email);
		if (membership && membership.id) {
			targetPerson.nsda = membership.id;
			await kdb.updateTable('person')
				.set({ nsda: membership.id })
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
		const membership = await getNSDAMemberId(nsdaIdentities[0].nsda_email);
		if (membership && membership.id) {
			if ( membership.id !== targetPerson.nsda ) {
				nsdaIds[membership.id] = true;
			}
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

export const syncLearnByCourse = async (quiz) => {

	const courseData = await getNSDA(`/learn/courses/${quiz.nsda_course}`);
	const usersByNsdaId = {};
	const usersByEmail = {};

	for (const courseResult of courseData) {
		usersByNsdaId[courseResult.person_id] = courseResult;
		usersByEmail[courseResult.email.toLowerCase()] = courseResult;
	}

	// First filter everyone out who's already been tagged, and then
	// update everyone with an existing PQ that is not completed.

	const { rows: existingPQs } = await sql`
		select person.id, person.email, person.nsda, person.first, person.last,
			pq.id pq, pq.completed, pq.updated_at, pq.approved_by,
			nsda_email.value nsda_email,
			nsda_id.value nsda_id
		from (person, person_quiz pq, quiz)
			left join person_setting nsda_email on nsda_email.person = person.id and nsda_email.tag = 'nsda_email'
			left join person_setting nsda_id on nsda_id.person = person.id and nsda_id.tag = 'nsda_id'
		where 1=1
			and person.id = pq.person
			and pq.quiz = ${quiz.id}
		group by pq.id
	`.execute(kdb);

	let allPromises = [];
	const altSettings = [];

	const now = new Date();
	const logs = [];

	for (const person of existingPQs) {

		let existing = usersByEmail[person.email.toLowerCase()];

		if (!existing && person.nsda_email) {
			existing = usersByEmail[person.nsda_email.toLowerCase()];
		}

		if (
			existing
			&& (person.email === existing.email || person.email === existing.nsda_email)
			&& parseInt(person.nsda) !== parseInt(existing.person_id)
			&& parseInt(person.nsda_id) !== parseInt(existing.person_id)
		) {

			if (person.nsda) {

				const tabroomPerson = await getNSDA(`/members/${person.nsda}`);
				const nsdaPerson = await getNSDA(`/members/${existing.person_id}`);

				logs.push(`${now}: NSDA ID Mismatch: Same email ${existing.email}. Tabroom NSDA: ${person.nsda} Second ${person.nsda_id} and NSDA ID: ${existing.person_id}`);

				if (!tabroomPerson) {

					if (nsdaPerson.last === person.last || nsdaPerson.first === person.first) {

						logs.push(`${now}: NSDA ID ${person.nsda} is invalid. Name match so switching to valid NSDA ID ${nsdaPerson.person_id}`);

						swapNSDA(
							person.id,
							nsdaPerson.person_id,
							`NSDA Learn unlinked invalid NSDA ID ${person.nsda}.  Switched to ${nsdaPerson.person_id}`
						);

					} else {

						logs.push(`${now}: NSDA ID ${person.nsda} is invalid. No name match, unlinking`);

						wipeNSDA(
							person.id,
							`NSDA Learn unlinked from invalid NSDA ID ${person.nsda}`,
						);
					}

				} else {

					if (tabroomPerson.last !== person.last && tabroomPerson.first !== person.first) {

						if (
							nsdaPerson.last === person.last
							&& nsdaPerson.first === person.first
						) {

							swapNSDA(
								person.id,
								nsdaPerson.person_id,
								`NSDA Learn unlinked from ${tabroomPerson.person_id} due to name and ID mismatch.  Switched to ${nsdaPerson.person_id}`,
							);

						} else {

							wipeNSDA(
								person.id,
								nsdaPerson.person_id,
								`NSDA Learn unlinked from ${tabroomPerson.person_id} due to name and ID mismatch`,
							);
						}

					} else {
						const altNSDA = {
							tag    : 'nsda_id',
							value  : nsdaPerson.person_id,
							person : person.id,
						};
						altSettings.push(altNSDA);
					}
				}

			} else if (!person.nsda) {

				await kdb.updateTable('person')
					.set({ nsda: existing.person_id })
					.where('id', '=', person.id)
					.execute();

				logs.push(`${now} Linked Tabroom ${person.email} to NSDA ID: ${existing.person_id}`);

				await changeLogRepo.createChangeLog(kdb, {
					tag         : 'link',
					person      : person.id,
					description : `NSDA Learn linked user to ${existing.person_id} because of email match`,
				});
			}
		}

		let nsdaExisting = usersByNsdaId[person.nsda];

		if (!nsdaExisting && person.nsda_id) {
			nsdaExisting = usersByNsdaId[parseInt(person.nsda_id)];
		}

		if (
			nsdaExisting
			&& person.email !== nsdaExisting.email
			&& (
				parseInt(person.nsda) === parseInt(nsdaExisting.person_id)
				|| parseInt(person.nsda_id) === parseInt(nsdaExisting.person_id)
			)
			&& ( !person.nsda_email || person.nsda_email !== nsdaExisting.email)
		) {

			logs.push(`${now}: Email Mismatch: NSDA ID: ${person.nsda} belongs to Tabroom email ${person.email} and NSDA email ${nsdaExisting.email}`);

			const altEmail = {
				tag    : 'nsda_email',
				value  : nsdaExisting.email,
				person : person.id,
			};

			altSettings.push(altEmail);

			// See if the primary Tabroom email also has an ID number and stash that too
			const membership = await getNSDAMemberId(person.email);
			logs.push(`${now}: Found membership info ${JSON.stringify(membership)} with original email ${person.email}`);

			if (membership && membership.id) {
				const altId = {
					tag    : 'nsda_id',
					value  : membership.id,
					person : person.id,
				};
				altSettings.push(altId);
			}
		}

		if (
			nsdaExisting
			&& nsdaExisting.completed
			&& person.completed
			&& person.approved_by
		) {

			delete usersByNsdaId[person.nsda];
			delete usersByNsdaId[person.nsda_id];
			delete usersByEmail[person.email.toLowerCase()];

		} else {

			if (usersByNsdaId[person.nsda] || usersByEmail[person.email.toLowerCase()]) {

				const promise = kdb.updateTable('person_quiz')
					.set({ completed: 1, approved_by: 3, updated_at: person.updated_at })
					.where('id', '=', person.pq)
					.execute();

				allPromises.push(promise);

				if (usersByNsdaId[person.nsda]) {
					delete usersByNsdaId[person.nsda];
				}
				if (usersByEmail[person.email.toLowerCase()]) {
					delete usersByEmail[person.email.toLowerCase()];
				}
			}
		}
	}

	if (altSettings.length > 0) {
		await kdb.insertInto('person_setting')
			.values(altSettings)
			.ignore()
			.execute();
	}

	await Promise.all(allPromises);
	allPromises = [];

	// And now we're left with some ID numbers and email addresses that were
	// not synced or launched from Tabroom.

	const userIds = Object.keys(usersByNsdaId);

	if (userIds.length > 0) {

		const { rows: notExisting } = await sql`
			select person.id, person.nsda, person.email, person.middle,
				nsda_id.value nsda_id,
				nsda_email.value nsda_email
				from person
				left join person_setting nsda_id on nsda_id.person = person.id and nsda_id.tag = 'nsda_id'
				left join person_setting nsda_email on nsda_email.person = person.email and nsda_email.tag = 'nsda_email'
			where 1=1
			and (
				person.nsda IN (${sql.join(userIds)})
				OR EXISTS (
					select ps.id
					from person_setting ps
					where ps.person = person.id
					and ps.tag='nsda_id'
					and ps.value IN (${sql.join(userIds)})
				)
			)
		`.execute(kdb);

		await sql`
			delete pq.*
				from person, person_quiz pq
			where 1=1
				and person.nsda IN (${sql.join(userIds)})
				and person.id = pq.person
				and pq.quiz = ${quiz.id}
		`.execute(kdb);

		const pqAdds = [];

		for (const person of notExisting) {

			let courseUser = usersByNsdaId[person.nsda];

			if (!courseUser && person.nsda_id) {
				courseUser = usersByNsdaId[person.nsda_id];
			}

			if (courseUser && courseUser.completed) {

				pqAdds.push({
					person      : person.id,
					quiz        : quiz.id,
					completed   : 1,
					approved_by : 3,
					updated_at  : new Date(courseUser.completed),
				});

				// I've already found this person by NSDA ID so I do not need to do by email
				delete usersByEmail[person.email.toLowerCase()];
				if (person.nsda_email) {
					delete usersByNsdaId[person.nsda_email.toLowerCase()];
				}
				delete usersByNsdaId[person.nsda];
				if (person.nsda_id) {
					delete usersByNsdaId[person.nsda_id];
				}
			}
		}

		if (pqAdds.length > 0) {
			const bigPromise = kdb.insertInto('person_quiz').values(pqAdds).execute();
			allPromises.push(bigPromise);
		}
	}

	await Promise.all(allPromises);
	allPromises = [];

	const userEmails = Object.keys(usersByEmail);

	if (userEmails.length > 0) {

		const emailAdds = [];
		let stillNotExisting = [];

		stillNotExisting = (await sql`
			select person.id, person.nsda, person.email, person.last, nsda_email.value nsda_email
				from person
				left join person_setting nsda_email on nsda_email.tag = 'nsda_email' and nsda_email.person = person.id
			where 1=1
			and
				(
					person.email IN (${sql.join(userEmails)})
					OR EXISTS (
						select ps.id
						from person_setting ps
						where ps.person = person.id
						and ps.tag='nsda_email'
						and ps.value IN (${sql.join(userEmails)})
					)
				)
		`.execute(kdb)).rows;

		await sql`
			delete pq.*
				from person, person_quiz pq
			where 1=1
				and (person.email IN (${sql.join(userEmails)})
					OR EXISTS (
						select ps.id
						from person_setting ps
						where ps.person = person.id
						and ps.tag='nsda_email'
						and ps.value IN (${sql.join(userEmails)})
					)
				)
				and person.id = pq.person
				and pq.quiz = ${quiz.id}
		`.execute(kdb);

		for (const person of stillNotExisting) {

			let courseUser = usersByEmail[person.email.toLowerCase()];

			if (!courseUser && person.nsda_email) {
				courseUser = usersByEmail[person.nsda_email.toLowerCase()];
			}

			if (courseUser && courseUser.completed) {

				if (
					person.nsda && parseInt(courseUser.person_id) !== person.nsda
					&& (!person.nsda_id || parseInt(person.nsda_id) !== courseUser.person_id)
				) {

					if (person.nsda_id !== courseUser.person_id) {
						logs.push(` ${now} NSDA ID Mismatch: Same email ${person.email}. Tabroom NSDA: ${person.nsda} and NSDA ID: ${courseUser.person_id}`);
					}

				} else if (courseUser && !person.nsda) {

					logs.push(` ${now} ${person.email} has no NSDA ID but email correponds to ${courseUser.person_id}.  Linking.`);

					const promiseOne = kdb.updateTable('person')
						.set({ nsda: courseUser.person_id })
						.where('id', '=', person.id)
						.execute();

					allPromises.push(promiseOne);
				}

				emailAdds.push({
					person      : person.id,
					quiz        : quiz.id,
					completed   : 1,
					approved_by : 3,
					updated_at  : new Date(courseUser.completed),
				});

				delete usersByEmail[person.email.toLowerCase()];
				if (person.nsda_email) {
					delete usersByEmail[person.nsda_email.toLowerCase()];
				}
				if (person.nsda) {
					delete usersByNsdaId[person.nsda];
				}
				delete usersByNsdaId[courseUser.person_id];
			}
		}

		if (emailAdds.length > 0) {
			const otherPromise = kdb.insertInto('person_quiz').values(emailAdds).execute();
			allPromises.push(otherPromise);
		}

	}

	await Promise.resolve(allPromises);

	const unmatchedResults = [];

	for (const nsdaId of Object.keys(usersByNsdaId)) {
		unmatchedResults.push( usersByNsdaId[nsdaId] );
	}
	for (const email of Object.keys(usersByEmail)) {
		const result = usersByEmail[email];
		if (!usersByNsdaId[result.person_id]) {
			unmatchedResults.push(result);
		}
	}

	const quizMisses = await kdb.selectFrom('tabroom_setting')
		.select('id')
		.where('tag', '=', `quiz_misses_${quiz.id}`)
		.executeTakeFirst();

	if (quizMisses) {
		await kdb.updateTable('tabroom_setting')
			.set({ value_text: JSON.stringify(unmatchedResults, null, ) })
			.where('id', '=', quizMisses.id)
			.execute();

	} else {

		await kdb.insertInto('tabroom_setting').values({
			tag        : `quiz_misses_${quiz.id}`,
			value      : 'text',
			person     : 3,
			value_text : JSON.stringify(unmatchedResults, null, 4),
		}).execute();
	}

	const quizLog = await kdb.selectFrom('tabroom_setting')
		.select('id')
		.where('tag', '=', `quiz_log_${quiz.id}`)
		.executeTakeFirst();

	if (quizLog) {
		await kdb.updateTable('tabroom_setting')
			.set({ value_text: JSON.stringify(logs, null, 4) })
			.where('id', '=', quizLog.id)
			.execute();

	} else {

		await kdb.insertInto('tabroom_setting').values({
			tag        : `quiz_log_${quiz.id}`,
			value      : 'text',
			person     : 3,
			value_text : JSON.stringify(logs, null, 4),
		}).execute();
	}

	return `${quiz.label} synchronized for ${courseData.length} records with ${logs.length} changes`;

};

export const swapNSDA = async (personId, goodNSDA, logMsg) => {
	await kdb.updateTable('person')
		.set({ nsda: goodNSDA })
		.where('id', '=', personId)
		.execute();

	await changeLogRepo.createChangeLog(kdb, {
		tag         : 'link',
		person      : personId,
		description : logMsg || `NSDA ID swapped to ${goodNSDA}`,
	});
};

export const wipeNSDA = async (personId, logMsg) => {
	await kdb.updateTable('person')
		.set({ nsda: null })
		.where('id', '=', personId)
		.execute();

	await changeLogRepo.createChangeLog(kdb, {
		tag         : 'link',
		person      : personId,
		description : logMsg || `NSDA ID deleted `,
	});
};

export default getNSDA;
