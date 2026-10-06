import changeLogRepo from '../../repos/changeLogRepo.js';
import studentRepo from '../../repos/studentRepo.js';
import logger from '../../helpers/logger.js';
import personRepo from '../../repos/personRepo.js';
import { RateLimitExceeded } from '../../helpers/problem.js';

import type { Request, Response } from 'express';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { getPerson } from '../../middleware/authorization/authorization.js';

import { db } from '../../data/database.js';

const STUDENT_SEARCH_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const STUDENT_SEARCH_LIMIT_MAX = 9;

export async function unlinkedSearch(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	let { first, last, limit, offset } = req.query;

	if(!req.session){
		throw new Error('Unauthorized: Missing session');
	}

	if (!first || !last) {
		first = person.first;
		last = person.last;
	}
	// log access to student search to the change log
	logStudentSearch(req.session, first, last).catch(err => {
		logger.error('Failed to log student search usage to changeLog:', err);
	});

	// if person is not site admin, apply rate limiting logic via person settings
	if (!person.site_admin) {
		const Person = await personRepo.getPerson(db,person.id, {
			settings: ['last_student_search', 'student_search_count'],
		});

		const lastSearch = Person?.settings?.last_student_search ? new Date(Person.settings.last_student_search) : null;
		const studentSearchCount = Number(Person?.settings?.student_search_count || 0);
		const now = new Date();
		const then = new Date(now.getTime() - STUDENT_SEARCH_LIMIT_WINDOW_MS);

		if (
			lastSearch
      && !Number.isNaN(lastSearch.getTime())
      && lastSearch > then
      && studentSearchCount > STUDENT_SEARCH_LIMIT_MAX
		) {
			return RateLimitExceeded(req, res,
				'Due to privacy concerns, you may only search for student records a few times every 24 hours.',
				{ validate: { trustProxy: false } }
			);
		}

		const nextStudentSearchCount = studentSearchCount + 1

		await personRepo.updatePerson(db, person.id, {
			settings: {
				student_search_count: nextStudentSearchCount,
				last_student_search: now,
			}
		});
	}

	const results = await studentRepo.unlinkedSearch(db,{ first, last }, { limit, offset });

	res.json(results.map(s => ({
		id: s.id,
		first: s.first,
		middle: s.middle,
		last: s.last,
		gradYear: s.grad_year ?? null,
		Chapter: {
			name: s.chapter_name,
			state: s.chapter_state,
		},
		tournCount: s.tourn_count,
	})));
}

async function logStudentSearch(session: NonNullable<Request['session']>, first: string, last: string) {
	let description = `Searched for student records ${first} ${last}`;

	if (session.su && session.su > 0 && session.Su?.email) {
		description += ` while logged in as ${session.Su.email}`;
	}

	description += ` from session ID ${session.id}`;

	await changeLogRepo.createChangeLog(db,{
		tag: 'student_search',
		person: session.su ?? session.person,
		description,
	});
}
