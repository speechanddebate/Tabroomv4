import studentRepo from '../../repos/studentRepo.js';
import { BadRequest } from '../../helpers/problem.js';
import { notify } from '../../services/notifications/notify.js';
import { linkRequest } from '../../services/notifications/templates/chapter/linkRequest.js';
import chapterRepo from '../../repos/chapterRepo.js';
import logger from '../../helpers/logger.js';
import  { db } from '../../data/database.js';

import { getPerson } from '../../middleware/auth/authorization.js';

import type { Request, Response } from 'express';
import type { ValidatedRequest } from '../../middleware/validation.js';

async function linkRequests(req: Request, res: Response) {
	const person = getPerson(req);
	const students = await studentRepo.getStudents(db, {
		person_request: person.id,
	});

	const results = students.map(s => ({
		id: s.id,
		first: s.first,
		last: s.last,
		chapterId: s.chapter,
		createdAt: s.created_at,
	}));

	return res.status(200).json(results);
};

async function claimRequest(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const { studentId } = req.query;
	if (!studentId) return BadRequest(req, res, 'Must provide studentId');

	const Student = await studentRepo.getStudent(db, studentId);
	if (!Student || !Student.chapter) {
		return BadRequest(req, res, 'Invalid student');
	}

	const already = await db.selectFrom('student')
	.select('id')
	.where('chapter', '=', Student.chapter)
	.where((eb) => eb.or([
		eb('person', '=', person.id),
		eb('person_request', '=', person.id)
	  ]))
	.executeTakeFirst();
	if (already) {
		return BadRequest(req, res, `You are already linked or have requested to be linked to another student on that school's roster. You can only be linked to 1 student per roster at a time. If you are linking yourself to all your school's students, DO NOT. Each student must have their OWN Tabroom account for the system to function.`);
	}

	// get the chapter admins

	const admins = await chapterRepo.getAdmins(db, Student.chapter);

	//if the person requesting is an admin for the chapter, auto-approve the request and skip sending the email
	if(admins.some(a => a.id === person.id)) {
		await studentRepo.updateStudent(db, studentId, { person: person.id, person_request: null });
		return res.status(200).json({
			message: 'Competitor linked successfully.',
			detail: 'Because you are a chapter admin, your request to link to this student has been automatically approved.',
		});

	}
	await studentRepo.updateStudent(db, studentId, { person_request: person.id });

	if(admins.some(a => a.email && !a.no_email)) {
		const { subject, html } = linkRequest({
			record: 'competitor',
			name: [Student.first, Student.last].filter(Boolean).join(' '),
			chapter: Student.chapter,
			requester: person,
		});
		await notify({
			ids: admins.filter(a => a.email && !a.no_email).map(a => a.id),
			subject,
			html: html.value,
			replyTo: `${person.first} ${person.last} <${person.email}>`,
		});
	} else {
		logger.warn('Chapter with id ' + Student.chapter + ' has no admins setup to receive emails. Cannot send student claim notification email.');
	}
	return res.status(200).json({
		message: 'Competitor claim request submitted',
		detail: 'A message has been sent to your chapter admins to approve this request. You will receive a notification once they have processed it.',
	});
}

export default {
	linkRequests,
	claimRequest,
};
