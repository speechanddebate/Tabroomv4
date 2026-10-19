// Works out which online room a person joins and how, ported from classic's funclib/online_room.mas.
// Knows nothing about the request: callers pass in whether the person is tab staff.

import type { OnlineRoom, OnlineRoomJoin } from '@tabroom/types';
import type { Database } from '../../data/database.js';
import config from '../../config.js';
import campusLogRepo from '../../repos/campusLogRepo.js';
import panelRepo from '../../repos/panelRepo.js';
import permissionRepo from '../../repos/permissionRepo.js';
import { isOn } from '../ballots/ballotRules.js';
import { campusServer, campusUuid, signCampusToken } from './campus.js';

/** The person joining a room */
export type RoomPerson = {
	id: number;
	first: string | null;
	last: string | null;
	site_admin: number | null;
};

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
	tag: 'panel' | 'observer';
	tourn: number;
	panel: number;
	judge: number | null;
	entry: number | null;
	description: string;
};

export type JoinRoomResult =
	// The section doesn't exist or the person has no part in it
	| { result: 'notFound' }
	// The room can't be joined online (in person, closed, no link)
	| { result: 'notJoinable' }
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
	/** whether the person can check the section in (checker or higher) */
	isStaff: boolean;
};

const CAMPUS_MODES = ['nsda_campus', 'nsda_campus_observers'];

const ROLE_PREFIX: Record<Role, string> = {
	competitor: 'Entry - ',
	judge: 'Judge - ',
	observer: 'Obsv - ',
	tab: 'Tab - ',
	admin: 'Admin - ',
};

type PanelJudge = Awaited<ReturnType<typeof panelRepo.getPanelJudges>>[number];
type PanelEntryStudent = Awaited<ReturnType<typeof panelRepo.getPanelEntryStudents>>[number];
type PanelRoles = { judge: PanelJudge | undefined; entry: PanelEntryStudent | undefined };

/** The name Campus shows for the person, following the event's online display settings */
function displayName(role: Role, eventSettings: Record<string, string> | null, person: RoomPerson, { judge, entry }: PanelRoles): string {
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
 * null when the section doesn't exist or the person has no part in it
 */
export async function getSectionRoom(db: Database, sectionId: number, person: RoomPerson, opts: SectionRoomOpts): Promise<ResolvedRoom | null> {
	const room = await panelRepo.getSectionRoomContext(db, sectionId);
	if (!room) return null;

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
		: opts.isStaff ? 'tab'
		: person.site_admin ? 'admin'
		: null;
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
		const host = !!roles.judge || opts.isStaff;
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

/** Join a section's room: logs the join to campus_log and returns what to open. Campus rooms get a signed token */
export async function joinSectionRoom(db: Database, sectionId: number, person: RoomPerson, opts: SectionRoomOpts): Promise<JoinRoomResult> {
	const room = await getSectionRoom(db, sectionId, person, opts);
	if (!room) return { result: 'notFound' };
	if (!room.launch) return { result: 'notJoinable' };

	const { url, password, campus } = room.launch;

	// sign before logging, so a join that can't open isn't logged
	let token: string | null = null;
	if (campus) {
		token = await signCampusToken(campus);
		if (!token) return { result: 'unavailable' };
	}

	await campusLogRepo.createCampusLog(db, { ...room.log, person: person.id });

	return { result: 'joined', join: { url, token, password } };
}
