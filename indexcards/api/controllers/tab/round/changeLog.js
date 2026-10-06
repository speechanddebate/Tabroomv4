import { sql } from 'kysely';
import objectify from '../../../helpers/objectify.js';
import { db } from '../../../data/database.js';

export async function getRoundChangeLog(req, res) {
	const roundQuery = sql`
    select
      cl.id, cl.tag, cl.description, cl.count,
      CONVERT_TZ(cl.timestamp, "+00:00", tourn.tz) timestamp,
      person.id person, person.email, person.first, person.last,
      round.id round, round.name round_name, round.label round_label

    from (change_log cl, round, event, tourn)

      left join person on cl.person = person.id

    where round.id = ${req.params.roundId}
      and round.id = cl.round
      and round.event = event.id
      and event.tourn = tourn.id
  `;

	const { rows: rawRoundLogs } = await roundQuery.execute(db);

	const panelQuery = sql`
      select
      cl.id, cl.tag, cl.description, cl.count,
      CONVERT_TZ(cl.timestamp, "+00:00", tourn.tz) timestamp,
      person.id person, person.email, person.first, person.last,
      round.id round, round.name round_name, round.label round_label,
      panel.id panel, panel.letter letter

    from (change_log cl, round, event, tourn, panel)

      left join person on cl.person = person.id

    where round.id = ${req.params.roundId}
      and round.id = panel.round
      and panel.id = cl.panel
      and round.event = event.id
      and event.tourn = tourn.id
  `;

	const { rows: rawPanelLogs } = await panelQuery.execute(db);

	const roundLogs = [...rawPanelLogs, ...rawRoundLogs];

	res.status(200).json(objectify(roundLogs));
}
