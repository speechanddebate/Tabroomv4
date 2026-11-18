import type { ConflictCandidate, JudgeConflict, JudgeConflicts } from '@tabroom/types';

export const judgeId = 701;

const lincoln = { id: 1810, name: 'Lincoln High School' };
const westlake = { id: 1811, name: 'Westlake' };
const riverdale = { id: 1812, name: 'Riverdale Prep' };
const plano = { id: 1813, name: 'Plano East' };

const ld = { id: 40, name: 'Lincoln-Douglas', abbr: 'LD' };

const candidate = (id: number, code: string, School: { id: number, name: string }, state: ConflictCandidate['state'], students: [string, string][] = []): ConflictCandidate => ({
	id,
	code,
	name: code,
	event: ld.id,
	Event: ld,
	category: 7,
	school: School.id,
	School,
	Students: students.map(([first, last], idx) => ({ id: id * 10 + idx, first, last })),
	state,
});

export const entryConflict: JudgeConflict = {
	id: 9001, type: 'entry', entry: 51003, Entry: { id: 51003, code: 'Westlake BB', name: 'Westlake BB', Event: { abbr: 'LD' } },
	school: null, School: null, region: null, Region: null, created_at: '2026-10-28T19:42:00.000Z', standing: null, removable: true,
};

const coachConflict: JudgeConflict = {
	id: 9002, type: 'school', entry: null, Entry: null, school: riverdale.id, School: riverdale,
	region: null, Region: null, created_at: '2026-10-14T16:05:00.000Z', standing: null, removable: false,
};

/* Tab marked Plano East for Jane, on a row old enough to have no date; she may remove it */
const tabConflict: JudgeConflict = {
	id: 9004, type: 'school', entry: null, Entry: null, school: plano.id, School: plano,
	region: null, Region: null, created_at: null, standing: null, removable: true,
};

/* Jane's standing conflict with Mia Nash; it comes off on her standing conflicts page */
const ownStanding: JudgeConflict = {
	id: 9005, type: 'entry', entry: 51009, Entry: { id: 51009, code: 'Westlake MN', name: 'Westlake MN', Event: { abbr: 'LD' } },
	school: null, School: null, region: null, Region: null, created_at: '2026-09-02T14:10:00.000Z', standing: 'own', removable: false,
};

/* Quinn Ross declared a standing conflict against Jane */
const otherStanding: JudgeConflict = {
	id: 9006, type: 'entry', entry: 51010, Entry: { id: 51010, code: 'Westlake QR', name: 'Westlake QR', Event: { abbr: 'LD' } },
	school: null, School: null, region: null, Region: null, created_at: '2026-09-20T21:30:00.000Z', standing: 'other', removable: false,
};

const base = (): Omit<JudgeConflicts, 'Strikes' | 'Candidates'> => ({
	Judge: { id: judgeId, code: 'J7', first: 'Jane', last: 'Doe', school: lincoln.id, School: lincoln },
	Tourn: { id: 3101, name: 'Bluebonnet Classic', tz: 'America/Chicago', mockTrial: false },
	editable: true,
});

/*
 * Jane has marked Westlake BB herself; her coach marked all of Riverdale; tab marked Plano East;
 * standing conflicts cover Westlake MN (hers) and Westlake QR (declared against her); Lincoln is her own school
 */
export const sheet = (): JudgeConflicts => ({
	...base(),
	Strikes: [entryConflict, coachConflict, tabConflict, ownStanding, otherStanding],
	Candidates: {
		Entries: [
			candidate(51001, 'Lincoln AA', lincoln, 'ownSchool', [['Ana', 'Adams']]),
			candidate(51002, 'Plano East CD', plano, 'school', [['Chris', 'Diaz']]),
			candidate(51005, 'Plano East EF', plano, 'school', [['Eve', 'Flores']]),
			candidate(51006, 'Riverdale GH', riverdale, 'school', [['Gia', 'Hall']]),
			candidate(51007, 'Riverdale IJ', riverdale, 'school', [['Ian', 'Jones']]),
			candidate(51003, 'Westlake BB', westlake, 'entry', [['Ben', 'Brown']]),
			candidate(51004, 'Westlake DD', westlake, 'open', [['Dana', 'Day']]),
			candidate(51008, 'Westlake KL', westlake, 'open', []),
			candidate(51009, 'Westlake MN', westlake, 'entry', [['Mia', 'Nash']]),
			candidate(51010, 'Westlake QR', westlake, 'entry', [['Quinn', 'Ross']]),
		],
		Regions: [],
	},
});

export const empty = (): JudgeConflicts => ({ ...base(), Strikes: [], Candidates: { Entries: [], Regions: [] } });

/* The category doesn't take judge conflicts; the coach's row still shows */
export const readOnly = (): JudgeConflicts => ({ ...base(), editable: false, Strikes: [coachConflict], Candidates: { Entries: [], Regions: [] } });

export const mockTrial = (): JudgeConflicts => ({
	...base(),
	Tourn: { ...base().Tourn, name: 'Texas Mock Trial Regionals', mockTrial: true },
	Strikes: [{
		id: 9003, type: 'region', entry: null, Entry: null, school: null, School: null,
		region: 31, Region: { id: 31, name: 'North Texas' }, created_at: '2026-10-28T19:42:00.000Z', standing: null, removable: true,
	}],
	Candidates: { Entries: [], Regions: [{ id: 32, name: 'Central Texas' }, { id: 33, name: 'South Texas' }] },
});
