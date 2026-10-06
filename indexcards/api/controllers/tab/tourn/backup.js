// import { showDateTime } from '../../../helpers/common.js';
import { objectify, arrayify, objectStrip, objectifySettings, objectifyGroupSettings } from '../../../helpers/objectify.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import BackupService from '../../../services/BackupService.js';

const allByTourn = (table, tournId) => kdb.selectFrom(table)
	.selectAll()
	.where('tourn', '=', tournId)
	.execute();

export async function backupTourn(req,res) {
	const tourn = await kdb.selectFrom('tourn')
		.selectAll()
		.where('id', '=', req.params.tournId)
		.executeTakeFirst();

	tourn.backup_created = new Date();
	tourn.created_by     = req.person.email;
	tourn.data_format    = '4.0';

	// A bunch of little things that are all at the other end of a simple
	// FK relationship:

	tourn.emails      = objectify(await allByTourn('email', tourn.id));
	tourn.webpages    = objectify(await allByTourn('webpage', tourn.id));
	tourn.permissions = objectify(await allByTourn('permission', tourn.id));
	tourn.fines       = objectify( await allByTourn('fine', tourn.id));
	tourn.patterns    = objectify( await allByTourn('pattern', tourn.id));
	tourn.timeslots   = objectify( await allByTourn('timeslot', tourn.id));

	tourn.settings      = objectifySettings(
		await allByTourn('tourn_setting', tourn.id)
	);

	// Circuits have a many to many join table so that's harder
	tourn.circuits = arrayify((await sql`
		select circuit.id
			from circuit, tourn_circuit tc
			where tc.tourn = ${req.params.tournId}
			and tc.circuit = circuit.id
		order by circuit.abbr
	`.execute(kdb)).rows, 'id');

	// Protocols, formerly known as tiebreak sets.
	const protocols = (await sql`
		select protocol.id pid, protocol.name pname,
			tiebreak.*
		from protocol
			left join tiebreak on tiebreak.protocol = protocol.id
		where protocol.tourn = ${req.params.tournId}
		group by tiebreak.id
		order by protocol.id, tiebreak.name
	`.execute(kdb)).rows;

	tourn.protocols = {};

	protocols.forEach( (protocol) => {
		if (!tourn.protocols[protocol.pid]) {
			tourn.protocols[protocol.pid] = {
				id        : protocol.pid,
				name      : protocol.pname,
				tiebreaks : {},
			};
		}

		tourn.protocols[protocol.pid].tiebreaks[protocol.id] = objectStrip(
			protocol,
			['pid', 'pname', 'timestamp', 'protocol', 'id']
		);
	});

	const rawProtocolSettings = (await sql`
		select ps.*
		from protocol, protocol_setting ps
		where protocol.tourn = ${req.params.tournId}
			and ps.protocol = protocol.id
	`.execute(kdb)).rows;

	tourn.protocols = objectifyGroupSettings(rawProtocolSettings, 'protocol', tourn.protocols);

	// Room Pools
	tourn.rpools = (await sql`
		select rpool.id, rpool.name, GROUP_CONCAT(distinct rpool_room.room) rooms, GROUP_CONCAT(distinct rpool_round.round) rounds
			from rpool, rpool_room,  rpool_round
		where rpool.tourn = ${req.params.tournId}
			and rpool.id = rpool_room.rpool
			and rpool.id = rpool_round.rpool
		group by rpool.id
	`.execute(kdb)).rows;

	tourn.rpools.forEach( (rpool)  => {
		rpool.rooms = rpool.rooms.toString().split(',');
		rpool.rounds = rpool.rooms.toString().split(',');
	});

	// Sites

	const sites = (await sql`
		select site.id sid, site.name sname, site.online, room.*
			from site, tourn_site ts, room
		where ts.tourn = ${req.params.tournId}
			and ts.site = site.id
			and site.id = room.site
			and room.deleted = 0
		group by room.id
			order by site.id, room.name
	`.execute(kdb)).rows;

	tourn.sites = {};

	sites.forEach( (room)  => {
		if (!tourn.sites[room.sid]) {
			tourn.sites[room.sid] = {
				name   : room.sname,
				online : room.online,
				rooms  : {},
			};
		}
		tourn.sites[room.sid].rooms[room.id] = objectStrip(
			room,
			['id', 'sid', 'sname', 'timestamp', 'deleted', 'online', 'building'],
			['ada', 'inactive'],
		);
	});

	// Tournament result sets.  These can be bulky.
	tourn.result_sets = objectify(await allByTourn('result_set', tourn.id));

	const resultKeys = (await sql`
		select result_key.*
			from result_set, result_key
		where result_key.result_set = result_set.id
			and result_set.tourn = ${req.params.tournId}
	`.execute(kdb)).rows;

	resultKeys.forEach( (rkey) => {
		if (!tourn.result_sets[rkey.result_set].keys) {
			tourn.result_sets[rkey.result_set].keys = {};
		}
		tourn.result_sets[rkey.result_set].keys[rkey.id] = objectStrip(
			rkey,
			['result_set', 'timestamp', 'id'],
			['no_sort', 'sort_desc'],
		);
	});

	const results = (await sql`
		select result.*
			from result_set, result
		where result.result_set = result_set.id
			and result_set.tourn = ${req.params.tournId}
	`.execute(kdb)).rows;

	results.forEach( (result) => {
		if (!tourn.result_sets[result.result_set].results) {
			tourn.result_sets[result.result_set].results = {};
		}
		tourn.result_sets[result.result_set].results[result.id] = objectStrip(
			result,
			['result_set', 'timestamp', 'id'],
		);
	});

	const resultValues = (await sql`
		select result_value.*, result_set.id result_set
			from result_set, result, result_value
		where result.result_set = result_set.id
			and result_set.tourn = ${req.params.tournId}
			and result.id = result_value.result
	`.execute(kdb)).rows;

	resultValues.forEach( (rValue) => {

		if (!tourn.result_sets[rValue.result_set].results[rValue.result].details) {
			tourn.result_sets[rValue.result_set].results[rValue.result].details = {};
		}

		tourn.result_sets[rValue.result_set].results[rValue.result].details[rValue.id] = objectStrip(
			rValue,
			['result_set', 'result', 'timestamp', 'id'],
		);
	});

	// And now the fun parts.  Registration data, which includes schools, entries, etc.  NOT judges in the full tourn dump.
	tourn.schools = objectify( await allByTourn('school', tourn.id));

	const rawSchoolSettings = (await sql`
		select ps.*
		from school, school_setting ps
		where school.tourn = ${req.params.tournId}
			and ps.school = school.id
	`.execute(kdb)).rows;

	tourn.schools = objectifyGroupSettings(rawSchoolSettings, 'school', tourn.schools);

	const rawSchoolStudents = (await sql`
		select
			student.id,
			student.first, student.middle, student.last, student.phonetic,
			student.grad_year, student.nsda, student.novice, student.retired,
			student.person, student.chapter,
			school.id school
		from event, entry, entry_student es, student, school
		where event.tourn = ${req.params.tournId}
			and event.id = entry.event
			and entry.id = es.entry
			and es.student = student.id
			and student.chapter = school.chapter
			and school.tourn = event.tourn
	`.execute(kdb)).rows;

	rawSchoolStudents.forEach( (student) => {
		const school = tourn.schools[student.school];
		if (!school.students) {
			school.students = {};
		}
		school.students[student.id] = student;
		delete school.students[student.id].chapter;
		delete school.students[student.id].school;
		delete school.students[student.id].id;
	});

	const rawSchoolEntries = (await sql`
		select
			entry.id,
			entry.code, entry.name,
			entry.ada, entry.active, entry.tba, entry.dropped, entry.waitlist, entry.unconfirmed,
			entry.dq,
			entry.created_at, entry.registered_by,
			entry.event, entry.school
		from school, entry
		where school.tourn = ${req.params.tournId}
			and school.id = entry.school
	`.execute(kdb)).rows;

	rawSchoolEntries.forEach( (entry) => {
		const school = tourn.schools[entry.school];

		if (!school.entries) {
			school.entries = {};
		}
		school.entries[entry.id] = entry;
		delete school.entries[entry.id].school;
		delete school.entries[entry.id].id;
	});

	const rawEntrySettings = (await sql`
		select
			entry.id entry, entry.school,
			es.tag, es.value, es.value_date, es.value_text
		from (entry, entry_setting es, school)
		where school.tourn = ${req.params.tournId}
			and school.id = entry.school
			and entry.id = es.entry
		group by entry.id
	`.execute(kdb)).rows;

	rawEntrySettings.forEach( (es) => {
		const entry = tourn.schools[es.school].entries[es.entry];

		if (!entry.value) {
			return;
		}

		if (!entry.settings) {
			entry.settings = {};
		}

		if (es.value === 'date') {
			entry.settings[es.tag] = es.value_date;
		} else if (es.value === 'text') {
			entry.settings[es.tag] = es.value_text;
		} else if (es.value === 'json') {
			entry.settings[es.tag] = es.value_json;
		} else if (es.value) {
			entry.settings[es.tag] = es.value;
		}
	});

	// And the real monster: categories, judges, events, rounds, and results.
	return res.status(200).json(tourn);
};

export async function restoreTourn(req,res) {
	const tournData = req.body;

	if (!tournData.tournId) {
		tournData.tournId = req.params.tournId;
	}

	if (!tournData.tournId) {
		tournData.tournId = req.session.tourn;
	}

	// So since you haven't actually written this yet, how about you
	// just punt here and call it a day before you do something
	// actually destructive

	return res.status(501).json({ message: 'This feature is a stub and not yet implemented' });
};

export async function Backup(req, res) {
	// TODO permission check
	const scope = req.body.scope || {};

	const backupData = await BackupService.generateBackup(
		Number(req.params.tournId),
		scope.type,
		scope.id !== undefined ? Number(scope.id) : null,
		{}
	);

	return res.status(200).json(backupData);
};
