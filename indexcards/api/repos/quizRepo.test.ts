import quizRepo from './quizRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('quizRepo', () => {
	describe('getQuizzes', () => {
		it('returns the quizzes with the given ids', async () => {
			const first = await factories.quiz.create();
			const second = await factories.quiz.create();
			await factories.quiz.create();

			const rows = await quizRepo.getQuizzes(db, { ids: [first.id, second.id] });

			expect(rows.map(quiz => quiz.id).sort()).toEqual([first.id, second.id].sort());
		});

		it('returns only the quizzes tied to an NSDA Learn course when asked', async () => {
			const learn = await factories.quiz.create({ nsda_course: 117271 });
			const zero = await factories.quiz.create({ nsda_course: 0 });
			const none = await factories.quiz.create();

			const rows = await quizRepo.getQuizzes(db, { ids: [learn.id, zero.id, none.id], learnCourse: true });

			expect(rows.map(quiz => quiz.id)).toEqual([learn.id]);
		});
	});

	describe('getPersonQuizzes', () => {
		it("returns the person's quiz attempts", async () => {
			const Person = await factories.person.create();
			const Quiz = await factories.quiz.create();
			const attempt = await factories.personQuiz.create({ person: Person.id, quiz: Quiz.id, completed: 1 });
			await factories.personQuiz.create({ quiz: Quiz.id });

			const rows = await quizRepo.getPersonQuizzes(db, { person: Person.id });

			expect(rows.map(row => row.id)).toEqual([attempt.id]);
			expect(rows[0]).toMatchObject({ quiz: Quiz.id, completed: 1 });
		});
	});
});
