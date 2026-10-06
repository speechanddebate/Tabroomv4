import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { EventFieldSchema } from '@tabroom/types';
import { faker } from '@faker-js/faker';

async function createField(settings: Record<string, number>) {
	const Tourn = await factories.tourn.create();
	const Category = await factories.category.create({ tourn: Tourn.id });
	const abbr = faker.string.alpha(6).toUpperCase();
	const Event = await factories.event.create({ tourn: Tourn.id, category: Category.id, abbr, settings });
	const Chapter = await factories.chapter.create();
	const School = await factories.school.create({ tourn: Tourn.id, chapter: Chapter.id });
	const Student = await factories.student.create({ chapter: Chapter.id });
	const Active = await factories.entry.create({ event: Event.id, school: School.id, students: [Student.id] });
	const Waitlisted = await factories.entry.create({ event: Event.id, school: School.id, active: 0, waitlist: 1 });
	return { Tourn, Event, Student, Active, Waitlisted };
}

describe('GET /rest/tourns/:tournId/events/:eventAbbr/field', () => {
	it('Returns the field for an event with a published field report', async () => {
		const { Tourn, Event, Student, Active, Waitlisted } = await createField({ field_report: 1 });

		const res = await request(server)
			.get(`/v1/rest/tourns/${Tourn.id}/events/${Event.abbr}/field`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(EventFieldSchema);
		expect(res.body.abbr).toBe(Event.abbr);
		const entryIds = res.body.Entries.map((entry: { id: number }) => entry.id);
		expect(entryIds).toContain(Active.id);
		expect(entryIds).not.toContain(Waitlisted.id);
		expect(res.body.Entries.find((entry: { id: number }) => entry.id === Active.id).Students[0].id).toBe(Student.id);
	});
	it('Includes waitlisted entries when the field waitlist is published', async () => {
		const { Tourn, Event, Waitlisted } = await createField({ field_report: 1, field_waitlist: 1 });

		const res = await request(server)
			.get(`/v1/rest/tourns/${Tourn.id}/events/${Event.abbr}/field`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(EventFieldSchema);
		const waitlisted = res.body.Entries.find((entry: { id: number }) => entry.id === Waitlisted.id);
		expect(waitlisted.Students).toEqual([]);
	});
	it('Returns 404 when the field report is not published', async () => {
		const { Tourn, Event } = await createField({});

		const res = await request(server)
			.get(`/v1/rest/tourns/${Tourn.id}/events/${Event.abbr}/field`)
			.set('Accept', 'application/json');

		expect(res).toBeProblemResponse(404);
	});
});
