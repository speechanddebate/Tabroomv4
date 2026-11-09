import type { ConflictRefusal, JudgeConflict, JudgeConflictRequest, JudgeConflicts } from '@tabroom/types';
import type { Database } from '../../data/database.js';
import type { SessionPerson } from '../../middleware/auth/types.js';
import { getCategory } from '../../repos/categoryRepo.js';
import changeLogRepo from '../../repos/changeLogRepo.js';
import entryRepo from '../../repos/entryRepo.js';
import judgeRepo from '../../repos/judgeRepo.js';
import regionRepo from '../../repos/regionRepo.js';
import schoolRepo from '../../repos/schoolRepo.js';
import strikeRepo from '../../repos/strikeRepo.js';
import tournRepo from '../../repos/tournRepo.js';
import { withTransaction } from '../../repos/utils/index.js';
import { isOn } from '../ballots/ballotRules.js';
import { candidateState, isRemovable } from './conflictRules.js';

type SheetStrike = Awaited<ReturnType<typeof strikeRepo.getJudgeConflicts>>[number];

/** The judge, their category and tournament with the settings the sheet reads, and the conflicts they may see */
async function loadSheet(db: Database, judgeId: number) {
	const judge = await judgeRepo.getJudge(db, judgeId);
	if (!judge?.category) return null;
	const category = await getCategory(db, judge.category, { settings: ['conflicts'] });
	if (!category?.tourn) return null;
	const [tourn, strikes] = await Promise.all([
		tournRepo.getTourn(db, category.tourn, { settings: ['mock_trial_registration'] }),
		strikeRepo.getJudgeConflicts(db, { judges: [judgeId], tourn: category.tourn }),
	]);
	if (!tourn) return null;
	return {
		judge,
		category,
		tournId: category.tourn,
		tourn,
		strikes,
		editable: isOn(category.settings?.conflicts),
		mockTrial: isOn(tourn.settings?.mock_trial_registration),
	};
}

const conflictRow = (strike: SheetStrike, personId: number): JudgeConflict => ({
	id: strike.id,
	type: strike.type as JudgeConflict['type'],
	entry: strike.entry,
	Entry: strike.entry === null ? null : { id: strike.entry, code: strike.entryCode, name: strike.entryName, Event: { abbr: strike.eventAbbr } },
	school: strike.school,
	School: strike.school === null ? null : { id: strike.school, name: strike.schoolName },
	region: strike.region,
	Region: strike.region === null ? null : { id: strike.region, name: strike.regionName },
	EnteredBy: strike.entered_by === null ? null : { first: strike.enteredFirst, last: strike.enteredLast },
	removable: isRemovable(strike, personId),
});

/** How the change log names a conflict's target */
const targetLabel = (strike: Pick<SheetStrike, 'type' | 'entryCode' | 'schoolName' | 'regionName'>): string => {
	switch (strike.type) {
		case 'entry': return `entry ${strike.entryCode}`;
		case 'school': return `school ${strike.schoolName}`;
		default: return `region ${strike.regionName}`;
	}
};

/**
 * A judge's conflict sheet at their tournament, as `personId` sees it: the conflicts the judge
 * may see and what they may still mark. Null when the judge or their tournament doesn't exist.
 */
export async function loadJudgeConflicts(db: Database, judgeId: number, personId: number): Promise<JudgeConflicts | null> {
	const sheet = await loadSheet(db, judgeId);
	if (!sheet) return null;
	const { judge, category, tournId, tourn, strikes, editable, mockTrial } = sheet;

	// mock trial judges conflict by region, so the entry list is never built for them
	const [school, entries, regions] = await Promise.all([
		judge.school ? schoolRepo.getSchool(db, judge.school) : null,
		editable && !mockTrial ? entryRepo.getCategoryEntries(db, { categories: [category.id], active: true }) : [],
		editable && mockTrial ? regionRepo.getRegions(db, { tourn: tournId }) : [],
	]);
	const students = await entryRepo.getEntryStudents(db, entries.map((entry) => entry.id));

	return {
		Judge: {
			id: judge.id,
			code: judge.code,
			first: judge.first,
			last: judge.last,
			school: judge.school,
			School: school ? { id: school.id, name: school.name } : null,
		},
		Tourn: { id: tourn.id, name: tourn.name, tz: tourn.tz ?? 'UTC', mockTrial },
		editable,
		Strikes: strikes.map((strike) => conflictRow(strike, personId)),
		Candidates: {
			Entries: entries.map((entry) => ({
				id: entry.id,
				code: entry.code,
				name: entry.name,
				event: entry.eventId,
				Event: { id: entry.eventId, name: entry.eventName, abbr: entry.eventAbbr },
				category: Number(entry.eventCategory),
				school: entry.school,
				School: entry.school === null ? null : { id: entry.school, name: entry.schoolName },
				Students: students
					.filter((student) => student.entry === entry.id)
					.map((student) => ({ id: student.id, first: student.first, last: student.last })),
				state: candidateState(entry, judge, strikes),
			})),
			Regions: regions
				.filter((region) => !strikes.some((strike) => strike.type === 'region' && strike.region === region.id))
				.map((region) => ({ id: region.id, name: region.name })),
		},
	};
}

export type AddOutcome =
	| { result: 'added'; conflict: JudgeConflict }
	| { result: 'refused'; reason: ConflictRefusal }
	| { result: 'notFound' };

/**
 * Marks a conflict for the judge the way classic's conflict_add.mhtml does, with the checks it
 * lacks: the category must take judge conflicts, the target must be one the judge could mark
 * at this tournament, and a covered target is refused instead of duplicated. Null when the judge
 * doesn't exist; notFound when the target isn't a candidate here.
 */
export async function addJudgeConflict(db: Database, judgeId: number, person: SessionPerson, request: JudgeConflictRequest): Promise<AddOutcome | null> {
	const sheet = await loadSheet(db, judgeId);
	if (!sheet) return null;
	const { judge, category, tournId, strikes, editable, mockTrial } = sheet;
	if (!editable) return { result: 'refused', reason: 'closed' };

	let target: Pick<SheetStrike, 'type' | 'entryCode' | 'schoolName' | 'regionName'> & { entry?: number; school?: number; region?: number };
	switch (request.type) {
		case 'entry': {
			const [entry] = mockTrial ? [] : await entryRepo.getCategoryEntries(db, { ids: [request.id], categories: [category.id], active: true });
			if (!entry) return { result: 'notFound' };
			const state = candidateState(entry, judge, strikes);
			if (state !== 'open') return { result: 'refused', reason: state === 'entry' ? 'duplicate' : state };
			target = { type: 'entry', entry: entry.id, entryCode: entry.code, schoolName: null, regionName: null };
			break;
		}
		case 'school': {
			const school = mockTrial ? undefined : await schoolRepo.getSchool(db, request.id);
			if (!school || school.tourn !== tournId) return { result: 'notFound' };
			if (school.id === judge.school) return { result: 'refused', reason: 'ownSchool' };
			if (strikes.some((strike) => strike.type === 'school' && strike.school === school.id)) return { result: 'refused', reason: 'duplicate' };
			target = { type: 'school', school: school.id, entryCode: null, schoolName: school.name, regionName: null };
			break;
		}
		case 'region': {
			const [region] = mockTrial ? await regionRepo.getRegions(db, { ids: [request.id], tourn: tournId }) : [];
			if (!region) return { result: 'notFound' };
			if (strikes.some((strike) => strike.type === 'region' && strike.region === region.id)) return { result: 'refused', reason: 'duplicate' };
			target = { type: 'region', region: region.id, entryCode: null, schoolName: null, regionName: region.name };
			break;
		}
	}

	const { type, entryCode, schoolName, regionName, ...columns } = target;
	const created = await withTransaction(db, async (trx) => {
		const strike = await strikeRepo.createStrike(trx, {
			...columns,
			type,
			tourn: tournId,
			judge: judge.id,
			conflict: 1,
			registrant: 1,
			conflictee: 1,
			entered_by: person.id,
		});
		await changeLogRepo.createChangeLog(trx, {
			tag: 'conflicts',
			tourn: tournId,
			category: category.id,
			judge: judge.id,
			person: person.id,
			description: `Conflict against ${targetLabel({ type, entryCode, schoolName, regionName })} added for judge ${judge.first} ${judge.last} by ${person.email}`,
		});
		return strike;
	});

	const [row] = await strikeRepo.getJudgeConflicts(db, { ids: [created.id], judges: [judgeId] });
	return { result: 'added', conflict: conflictRow(row, person.id) };
}

/**
 * Removes a conflict from the judge's sheet under classic's judge_conflict_rm.mhtml rule: the
 * row must be one the person entered or one declared from the judge's side. Null when the judge
 * or the row (on this judge's sheet) doesn't exist.
 */
export async function removeJudgeConflict(db: Database, judgeId: number, strikeId: number, person: SessionPerson): Promise<'removed' | 'forbidden' | null> {
	const sheet = await loadSheet(db, judgeId);
	if (!sheet) return null;
	const strike = sheet.strikes.find((row) => row.id === strikeId);
	if (!strike) return null;
	if (!isRemovable(strike, person.id)) return 'forbidden';

	await withTransaction(db, async (trx) => {
		await strikeRepo.deleteStrike(trx, strike.id);
		await changeLogRepo.createChangeLog(trx, {
			tag: 'conflicts',
			tourn: sheet.tournId,
			category: sheet.category.id,
			judge: sheet.judge.id,
			person: person.id,
			description: `Conflict against ${targetLabel(strike)} removed for judge ${sheet.judge.first} ${sheet.judge.last} by ${person.email}`,
		});
	});
	return 'removed';
}
