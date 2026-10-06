import request from 'supertest';
import server from '../../../../../app.js';
import z from 'zod';
import { QuizSchema } from '@tabroom/types';
import factories from '../../../../../tests/factories/index.js';

describe('Quizzes Router', () => {
  describe('GET /rest/quizzes', () => {
	it('should return a list of quizzes', async () => {
	  const response = await request(server)
	  .get('/v1/rest/quizzes');
	  expect(response.status).toBe(200);
	  expect(response.body).toMatchSchema(z.array(QuizSchema));
	});
	it('should not return hidden, non-sitewide, or admin-only quizzes', async () => {
		const hiddenQuiz = await factories.quiz.create({
			hidden: 1,
		});
		const nonSitewideQuiz = await factories.quiz.create({
			sitewide: 0,
		});
		const adminOnlyQuiz = await factories.quiz.create({
			admin_only: 1,
		});
	  const response = await request(server)
	  .get('/v1/rest/quizzes');
	  expect(response.status).toBe(200);
	  expect(response.body).toMatchSchema(z.array(QuizSchema));
	  const quizIds = response.body.map((quiz: { id: string }) => quiz.id);
	  expect(quizIds).not.toContain(hiddenQuiz.id);
	  expect(quizIds).not.toContain(nonSitewideQuiz.id);
	  expect(quizIds).not.toContain(adminOnlyQuiz.id);
 	});
	it('should attach the personQuiz if a person is authenticated', async () => {
		const Session = await factories.session.create();
		const Quiz = await factories.quiz.create();
		await factories.personQuiz.create({
			person: Session.person,
			quiz: Quiz.id,
		});
		const response = await request(server)
		.get('/v1/rest/quizzes')
		.asPerson(Session.userkey);
		expect(response.status).toBe(200);
		expect(response.body).toMatchSchema(z.array(QuizSchema));
		const quiz = response.body.find((q: { id: string }) => Number(q.id) === Quiz.id);
		expect(quiz).toBeDefined();
		expect(quiz.PersonQuizzes).toBeDefined();
		expect(quiz.PersonQuizzes.length).toBe(1);
		expect(quiz.PersonQuizzes[0].person).toBe(Session.person);
		expect(quiz.PersonQuizzes[0].quiz).toBe(Quiz.id);
	});	
});
});