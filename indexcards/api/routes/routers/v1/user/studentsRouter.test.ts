import factories from '../../../../../tests/factories/index.js';
import request from 'supertest';
import server from '../../../../../app.js';
import z from 'zod';
import { ClaimResponseSchema, StudentSchema } from '@tabroom/types';
import studentRepo from '../../../../repos/studentRepo.js';
import { db } from '../../../../data/database.js';

describe('studentsRouter', () => {
	let personId : number;
	let userkey: string;
	beforeAll(async () => {
		({ id: personId } = await factories.person.create());
		({ userkey } = await factories.session.create({ person: personId }));
	});
	describe("POST /user/students/claim", () => {
		it('should allow a user to claim a student', async () => {
			//setup - create a chapter student with no person_request
			const Chapter = await factories.chapter.create();
			const Student = await factories.student.create({
				person_request: null,
				chapter: Chapter.id,
			});
			//make the request to claim the chapter student
			const res = await request(server)
				.post('/v1/user/students/claim')
				.query({ studentId: Student.id })
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			//assert that the student's person_request is updated
			expect(res.body).toMatchSchema(ClaimResponseSchema);
			expect(res.body).toEqual({
				   message: 'Competitor claim request submitted',
				   detail: expect.any(String)
			});
			const updatedStudent = await studentRepo.getStudent(db, Student.id);
			expect(updatedStudent?.person_request).toBe(personId);
		});
		it('should return 400 if the user is already linked to a student on the roster', async () => {
			//setup - create a chapter student with a person_request for the user
			const Chapter = await factories.chapter.create();
			await factories.student.create({
				person_request: personId,
				chapter: Chapter.id,
			});
			//make the request to claim another chapter student
		 const Student = await factories.student.create({
				person_request: null,
				chapter: Chapter.id,
			});
			const res = await request(server)
				.post('/v1/user/students/claim')
				.query({ studentId: Student.id })
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(400);
			//assert that the response contains the appropriate error message
			expect(res).toBeProblemResponse(400);
			expect(res.body.detail).toContain('You are already linked or have requested to be linked to another student on that school\'s roster.');
			const updatedStudent = await studentRepo.getStudent(db, Student.id);
			expect(updatedStudent?.person_request).toBeNull();
			expect(updatedStudent?.person).toBeNull();
			
		});
		it('should automatically approve the claim if the user is a chapter admin', async () => {
			//setup - create a chapter student with no person_request and a chapter admin session for the user
			const Chapter = await factories.chapter.create();
			const Student = await factories.student.create({
				person_request: null,
				chapter: Chapter.id,
			});
			await factories.permission.create({
				person: personId,
				chapter: Chapter.id,
				tag: 'chapter',
			});
			//make the request to claim the chapter student
			const res = await request(server)
				.post('/v1/user/students/claim')
				.query({ studentId: Student.id })
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			//assert that the student's person_request is updated and the person field is also updated to link the student to the user
			expect(res.body).toEqual({
				message: 'Competitor linked successfully.',
				detail: expect.any(String)
			});
			const updatedStudent = await studentRepo.getStudent(db, Student.id);
			expect(updatedStudent?.person_request).toBeNull();
			expect(updatedStudent?.person).toBe(personId);
		});
	});
	describe("POST /user/students/linkRequests", () => {
		it("should return a list of pending link requests for the user", async () => {
			//setup - create a chapter student with a person_request for the user
			const Chapter = await factories.chapter.create();
			const Student = await factories.student.create({
				person_request: personId,
				chapter: Chapter.id,
			});
			//make the request to get pending link requests
			const res = await request(server)
				.get('/v1/user/students/linkRequests')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			//assert that the response contains the pending link request
			expect(res.body).toMatchSchema(z.array(StudentSchema));
			expect(res.body).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: Student.id })
				])
			);
		});
	})
});