// Works out which online room a person joins and how, ported from classic's funclib/online_room.mas.
// Knows nothing about the request: callers pass the actor, which says who the person is and what they can check in.

import type { OnlineRoom, OnlineRoomJoin, UtilityRoom } from '@tabroom/types';
import type { Database } from '../../data/database.js';
import type { Actor, SessionPerson } from '../../middleware/auth/types.js';
import config from '../../config.js';
import campusLogRepo from '../../repos/campusLogRepo.js';
import entryRepo from '../../repos/entryRepo.js';
import eventRepo from '../../repos/eventRepo.js';
import panelRepo from '../../repos/panelRepo.js';
import permissionRepo from '../../repos/permissionRepo.js';
import schoolRepo from '../../repos/schoolRepo.js';
import tournRepo from '../../repos/tournRepo.js';
import { isOn } from '../ballots/ballotRules.js';
import { campusServer, campusUuid, signCampusToken } from './campus.js';

type Role = 'judge' | 'competitor' | 'observer' | 'tab' | 'admin';

/** The claims of a Campus room token. Keys match classic's, which Campus reads */
export type CampusPayload = Record<string, string | number | null>;

/** What a join opens: a link (and its password), or a Campus room */
export type RoomLaunch = {
	url: string;
	password: string | null;
	campus: CampusPayload | null;
};

/** The campus_log row a join writes */
export type RoomLog = {
	tag: 'panel' | 'observer' | 'school' | 'prep' | 'campus';
	tourn: number;
	description: string;
	panel?: number;
	judge?: number | null;
	entry?: number | null;
	school?: number;
	uuid?: string;
};

export type JoinRoomResult =
	// The room doesn't exist or the person has no part in it
	| { result: 'notFound' }
	// The room can't be joined online (in person, closed, no link)
	| { result: 'notJoinable' }
	// The utility room at that id changed since the person's list was loaded
	| { result: 'changed' }
	// It's a Campus room but no Campus key is configured. Logged where it's detected
	| { result: 'unavailable' }
	| { result: 'joined', join: OnlineRoomJoin };

export type ResolvedRoom = {
	display: OnlineRoom;
	/** null when the room can't be joined online */
	launch: RoomLaunch | null;
	log: RoomLog;
};

type SectionRoomOpts = {
	/** an entry in the section the person is observing as its coach */
	observer?: number;
};

const CAMPUS_MODES = ['nsda_campus', 'nsda_campus_observers'];

const ROLE_PREFIX: Record<Role, string> = {
	competitor: 'Entry - ',
	judge: 'Judge - ',
	observer: 'Obsv - ',
	tab: 'Tab - ',
	admin: 'Admin - ',
};

/**
 * Whether a site admin is labelled as an admin in Campus rather than as tab staff: true unless they hold a
 * tab staff perm (checker or higher) on the tourn. can() passes every check for site admins, so it can't say
 */
async function isAdminLabel(db: Database, tournId: number, person: SessionPerson) {
	if (!person.site_admin) return false;
	const perms = await permissionRepo.getPermissions(db, { tourn: tournId, person: person.id });
	return !perms.some(perm => ['owner', 'tabber', 'checker'].includes(perm.tag ?? ''));
}

type PanelJudge = Awaited<ReturnType<typeof panelRepo.getPanelJudges>>[number];
type PanelEntryStudent = Awaited<ReturnType<typeof panelRepo.getPanelEntryStudents>>[number];
type PanelRoles = { judge: PanelJudge | undefined; entry: PanelEntryStudent | undefined };

/** The name Campus shows for the person, following the event's online display settings */
function displayName(role: Role, eventSettings: Record<string, string> | null, person: SessionPerson, { judge, entry }: PanelRoles): string {
	const prefix = isOn(eventSettings?.online_prepend_role) ? ROLE_PREFIX[role] : '';
	const name = [person.first, person.last].filter(Boolean).join(' ');

	if (role === 'competitor' && entry) {
		switch (eventSettings?.online_entry_display) {
			case 'name': return prefix + (entry.entryName ?? '');
			case 'code_first': return `${prefix}${entry.entryCode ?? ''} ${entry.first ?? ''}`.trim();
			case 'code_name': return `${prefix}${entry.entryCode ?? ''} ${entry.entryName ?? ''}`.trim();
			default: return prefix + (entry.entryCode ?? '');
		}
	}

	if (role === 'judge' && judge) {
		switch (eventSettings?.online_judge_display) {
			case 'code': return prefix + (judge.code ?? '');
			case 'code_first': return `${prefix}${judge.code ?? ''} ${person.first ?? ''}`.trim();
			case 'code_name': return `${prefix}${judge.code ?? ''} ${name}`.trim();
			default: return prefix + name;
		}
	}

	return prefix + name;
}

/**
 * A section's room for a person: what to show, what joining opens, and the log a join writes.
 * null when the section isn't in the tourn or the person has no part in it
 */
export async function getSectionRoom(db: Database, tournId: number, sectionId: number, actor: Actor, opts: SectionRoomOpts = {}): Promise<ResolvedRoom | null> {
	const person = actor.Person;
	if (!person) return null;

	const room = await panelRepo.getSectionRoomContext(db, sectionId);
	if (!room || room.tournId !== tournId) return null;

	// tab staff (checker or higher) get in and get the host link
	const isStaff = await actor.can('panel', 'check', sectionId);

	const { eventSettings, roundSettings, panelSettings, tournSettings } = room;

	const [judges, entryStudents] = await Promise.all([
		panelRepo.getPanelJudges(db, sectionId),
		panelRepo.getPanelEntryStudents(db, sectionId),
	]);
	const roles: PanelRoles = {
		judge: judges.find(judge => judge.person === person.id),
		entry: entryStudents.find(student => student.person === person.id),
	};
	const mode = isOn(roundSettings?.use_normal_rooms) ? 'sync' : eventSettings?.online_mode ?? null;

	let observed = null;
	if (!roles.judge && !roles.entry && opts.observer && mode === 'nsda_campus_observers') {
		// a coach of the entry's school can observe it
		const entry = entryStudents.find(student => student.entryId === opts.observer);
		if (entry?.chapter) {
			const perms = await permissionRepo.getPermissions(db, { person: person.id, chapter: entry.chapter });
			if (perms.some(perm => perm.tag === 'chapter')) observed = entry;
		}
	}

	const role: Role | null = roles.judge ? 'judge'
		: roles.entry ? 'competitor'
		: observed ? 'observer'
		: !isStaff ? null
		: await isAdminLabel(db, tournId, person) ? 'admin'
		: 'tab';
	if (!role) return null;

	// Events that share rooms (online_event_match) meet in the other event's section
	const panelId = room.matchPanelId ?? room.panelId;
	const eventId = room.matchPanelId ? room.matchEventId : room.eventId;
	const eventAbbr = room.matchPanelId ? room.matchEventAbbr : room.eventAbbr;

	const hybrid = isOn(panelSettings?.online_hybrid);
	const campus = CAMPUS_MODES.includes(mode ?? '');
	const name = campus && !hybrid ? `${eventAbbr ?? ''} ${room.panelLetter ?? ''}`.trim() : room.roomName;

	const log: RoomLog = {
		tag: role === 'observer' ? 'observer' : 'panel',
		tourn: room.tournId,
		panel: panelId,
		judge: roles.judge?.id ?? null,
		entry: observed?.entryId ?? roles.entry?.entryId ?? null,
		description: role === 'observer' ? `Entered ${name} as an observer` : `Entered ${name} from Tabroom`,
	};

	const offline = (display: Partial<OnlineRoom> = {}): ResolvedRoom => ({
		display: { name: room.roomName, joinable: false, hybrid: false, mapUrl: null, ...display },
		launch: null,
		log,
	});

	// Rooms close an hour after the round is done
	if (!room.live) return offline();

	// A hybrid event meets in person, except in the sections marked hybrid
	if (isOn(eventSettings?.online_hybrid) && panelSettings?.online_hybrid === undefined) {
		return offline({ mapUrl: room.roomUrl || null });
	}

	if (mode === 'sync') {
		// judges and tab get the host link and password when the room has one
		const host = !!roles.judge || isStaff;
		const url = roundSettings?.override_link || (host && room.roomJudgeUrl) || room.roomUrl || null;
		if (!url) return offline();

		return {
			display: { name: room.roomName, joinable: true, hybrid: false, mapUrl: null },
			launch: {
				url,
				password: (host && room.roomJudgePassword) || room.roomPassword || null,
				campus: null,
			},
			log,
		};
	}

	if (!campus) return offline();

	const objectId = roles.judge ? `judge-${roles.judge.id}`
		: roles.entry ? `entry-${roles.entry.entryId}`
		: observed ? String(observed.entryId)
		: null;

	return {
		display: {
			name,
			joinable: true,
			hybrid,
			mapUrl: hybrid ? roundSettings?.override_link || room.roomUrl || null : null,
		},
		launch: {
			url: config.campus.uri,
			password: null,
			campus: {
				source: 'tabroom',
				person_id: person.id,
				role,
				object_id: objectId,
				displayName: displayName(role, eventSettings, person, roles),
				roomName: name,
				roomInstructions: eventSettings?.online_instructions ?? null,
				supportEmail: eventSettings?.online_support ?? null,
				server: campusServer(tournSettings?.campus_zone, room.tournTz),
				uuid: campusUuid(panelId, room.panelLetter ?? ''),
				panel_id: panelId,
				panel_type: role === 'observer' ? 'observer' : 'panel',
				tourn_id: room.tournId,
				event_id: eventId,
				tz: room.tournTz,
				mode,
				hybrid: hybrid ? 1 : null,
				entry_code: roles.entry?.entryCode ?? null,
				judge_code: roles.judge?.code ?? null,
			},
		},
		log,
	};
}

/** Join a resolved room: logs the join to campus_log and returns what to open. Campus rooms get a signed token */
async function joinRoom(db: Database, room: ResolvedRoom | null, actor: Actor): Promise<JoinRoomResult> {
	if (!room) return { result: 'notFound' };
	if (!room.launch) return { result: 'notJoinable' };

	const { url, password, campus } = room.launch;

	// sign before logging, so a join that can't open isn't logged
	let token: string | null = null;
	if (campus) {
		token = await signCampusToken(campus);
		if (!token) return { result: 'unavailable' };
	}

	await campusLogRepo.createCampusLog(db, { ...room.log, person: actor.id });

	return { result: 'joined', join: { url, token, password } };
}

export async function joinSectionRoom(db: Database, tournId: number, sectionId: number, actor: Actor, opts: SectionRoomOpts = {}): Promise<JoinRoomResult> {
	return await joinRoom(db, await getSectionRoom(db, tournId, sectionId, actor, opts), actor);
}

// ---- Tourn-wide rooms: school squad rooms, entry prep rooms and utility rooms ----

const personName = (person: SessionPerson) => [person.first, person.last].filter(Boolean).join(' ');

/** How the person takes part in a tourn: their judges, their entries, and the schools they coach */
async function tournMembership(db: Database, tournId: number, personId: number) {
	const summary = await tournRepo.getPersonTournSummary(db, personId, tournId);
	const entries = summary?.entries.length
		? await entryRepo.getEntries(db, { ids: summary.entries.map(entry => entry.id) })
		: [];

	return {
		judges: summary?.judges ?? [],
		entries,
		coachedSchools: new Set(summary?.coaches.map(school => school.id)),
	};
}

/** Launches the Campus room with these claims, in the tourn's Campus server */
function campusLaunch(claims: CampusPayload): RoomLaunch {
	return { url: config.campus.uri, password: null, campus: { source: 'tabroom', mode: 'nsda_campus', ...claims } };
}

/**
 * A school's squad room, for its coaches, its students and tab staff. null when the school isn't in the tourn,
 * opted out (no_squad_room), the tourn has no Campus events, or the person has no part in it
 */
export async function getSchoolRoom(db: Database, tournId: number, schoolId: number, actor: Actor): Promise<ResolvedRoom | null> {
	const person = actor.Person;
	if (!person) return null;

	const school = await schoolRepo.getSchool(db, schoolId, { settings: ['no_squad_room'] });
	if (school?.tourn !== tournId || isOn(school.settings?.no_squad_room)) return null;

	const tourn = await tournRepo.getTourn(db, tournId, { settings: true, unpublished: true });
	if (!tourn) return null;
	// tab staff (checker or higher) and site admins see every school's room
	const seesAll = await actor.can('tourn', 'check', tourn.id);

	const events = await eventRepo.getEvents(db, { tourn: tourn.id, settings: ['online_mode'] });
	if (!events.some(event => CAMPUS_MODES.includes(String(event.settings?.online_mode)))) return null;

	if (!seesAll) {
		const { entries, coachedSchools } = await tournMembership(db, tourn.id, person.id);
		if (!coachedSchools.has(school.id) && !entries.some(entry => entry.school === school.id)) return null;
	}

	const name = `${school.name} Squad Room`;

	return {
		display: { name, joinable: true, hybrid: false, mapUrl: null },
		launch: campusLaunch({
			person_id: person.id,
			uuid: campusUuid('school', school.id),
			tourn_id: tourn.id,
			roomName: name,
			displayName: personName(person),
			panel_id: school.id,
			panel_type: 'school',
			server: campusServer(tourn.settings?.campus_zone, tourn.tz),
		}),
		log: { tag: 'school', tourn: tourn.id, school: school.id, description: `Entered ${name} from Tabroom` },
	};
}

export async function joinSchoolRoom(db: Database, tournId: number, schoolId: number, actor: Actor): Promise<JoinRoomResult> {
	return await joinRoom(db, await getSchoolRoom(db, tournId, schoolId, actor), actor);
}

/**
 * An entry's prep room, for its students, their coaches and tab staff. null when the entry isn't in the tourn,
 * its event doesn't use prep rooms (online_prep), or the person has no part in it
 */
export async function getEntryPrepRoom(db: Database, tournId: number, entryId: number, actor: Actor): Promise<ResolvedRoom | null> {
	const person = actor.Person;
	if (!person) return null;

	const entry = await entryRepo.getEntry(db, entryId);
	if (!entry?.event) return null;

	const event = await eventRepo.getEvent(db, entry.event, { settings: ['online_prep'] });
	if (event?.tourn !== tournId || !isOn(event.settings?.online_prep)) return null;

	const tourn = await tournRepo.getTourn(db, tournId, { settings: true, unpublished: true });
	if (!tourn) return null;
	// tab staff (checker or higher) and site admins see every entry's room
	const seesAll = await actor.can('tourn', 'check', tourn.id);

	if (!seesAll) {
		const { entries, coachedSchools } = await tournMembership(db, tourn.id, person.id);
		if (!entries.some(mine => mine.id === entry.id) && !(entry.school && coachedSchools.has(entry.school))) return null;
	}

	const name = `${entry.code ?? ''} Prep Room`.trim();

	return {
		display: { name, joinable: true, hybrid: false, mapUrl: null },
		launch: campusLaunch({
			person_id: person.id,
			uuid: campusUuid('entry', entry.id),
			tourn_id: tourn.id,
			event_id: event.id,
			roomName: name,
			displayName: personName(person),
			panel_id: entry.id,
			panel_type: 'entry',
			server: campusServer(tourn.settings?.campus_zone, tourn.tz),
		}),
		log: { tag: 'prep', tourn: tourn.id, entry: entry.id, description: `Entered ${name} from Tabroom` },
	};
}

export async function joinEntryPrepRoom(db: Database, tournId: number, entryId: number, actor: Actor): Promise<JoinRoomResult> {
	return await joinRoom(db, await getEntryPrepRoom(db, tournId, entryId, actor), actor);
}

/** A utility room as classic saves it in the tourn's online_rooms setting */
type UtilityRoomSetting = {
	id: number;
	name: string;
	type: 'jitsi' | 'link';
	url: string | null;
	uuid: string | null;
	access: 'entry' | 'judge' | 'coach' | 'tab';
	event_id: number | null;
	category_id: number | null;
};

/** The tourn's utility rooms. Classic saves ids as strings and an unset event or category as '' */
function utilityRoomSettings(value: unknown): UtilityRoomSetting[] {
	let rooms = value;
	if (typeof rooms === 'string') {
		try {
			rooms = JSON.parse(rooms);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(rooms)) return [];

	return rooms.map((room) => ({
		id: Number(room.id),
		name: String(room.name ?? ''),
		type: room.type === 'jitsi' ? 'jitsi' : 'link',
		url: room.url || null,
		uuid: room.uuid || null,
		access: room.access,
		event_id: Number(room.event_id) || null,
		category_id: Number(room.category_id) || null,
	}));
}

export type ResolvedUtilityRoom = Omit<ResolvedRoom, 'display'> & { display: UtilityRoom };

/**
 * The tourn's utility rooms the person can see, from its online_rooms setting. Attendees see them from
 * the tourn's start to its end; tab staff and site admins always. null when the tourn doesn't exist
 */
export async function getUtilityRooms(db: Database, tournId: number, actor: Actor): Promise<ResolvedUtilityRoom[] | null> {
	const person = actor.Person;
	if (!person) return null;

	const tourn = await tournRepo.getTourn(db, tournId, { settings: true, unpublished: true });
	if (!tourn) return null;
	// tab staff (checker or higher) and site admins see every room
	const seesAll = await actor.can('tourn', 'check', tourn.id);
	// marked as tab in Campus rooms
	const isStaff = seesAll && !await isAdminLabel(db, tourn.id, person);

	const rooms = utilityRoomSettings(tourn.settings?.online_rooms);

	const now = new Date();
	if (!seesAll && (!tourn.start || !tourn.end || now < tourn.start || now > tourn.end)) return [];

	const { judges, entries, coachedSchools } = await tournMembership(db, tourn.id, person.id);
	const isCoach = coachedSchools.size > 0;

	const canSee = async (room: UtilityRoomSetting) => {
		if (seesAll) return true;
		switch (room.access) {
			case 'entry': return entries.some(entry => !room.event_id || entry.event === room.event_id);
			case 'judge': return judges.some(judge => !room.category_id || judge.category_id === room.category_id);
			case 'coach': return isCoach;
			case 'tab':
				if (room.event_id) return await actor.can('event', 'check', room.event_id);
				if (room.category_id) return await actor.can('category', 'check', room.category_id);
				return false;
			default: return false;
		}
	};

	const visible: ResolvedUtilityRoom[] = [];

	for (const room of rooms) {
		if (!await canSee(room)) continue;

		const launch = room.type === 'link'
			? (room.url ? { url: room.url, password: null, campus: null } : null)
			: (room.uuid ? campusLaunch({
				person_id: person.id,
				uuid: room.uuid,
				tourn_id: tourn.id,
				event_id: room.event_id,
				roomName: room.name,
				displayName: personName(person) + (isStaff ? ' -Tab' : isCoach ? ' -Coach' : ''),
				panel_id: room.uuid,
				panel_type: 'util',
			}) : null);

		visible.push({
			display: { id: room.id, name: room.name, joinable: !!launch, hybrid: false, mapUrl: null },
			launch,
			log: { tag: 'campus', tourn: tourn.id, uuid: room.uuid ?? String(room.id), description: `Entered ${room.name} from Tabroom` },
		});
	}

	return visible;
}

/**
 * Join a utility room. Classic renumbers utility rooms whenever they're saved, so the join names the room
 * it expects at that id, and a different room there means the person's list is out of date
 */
export async function joinUtilityRoom(db: Database, tournId: number, roomId: number, name: string, actor: Actor): Promise<JoinRoomResult> {
	const rooms = await getUtilityRooms(db, tournId, actor);
	const room = rooms?.find(utility => utility.display.id === roomId);
	if (!room) return { result: 'notFound' };
	if (room.display.name !== name) return { result: 'changed' };

	return await joinRoom(db, room, actor);
}
