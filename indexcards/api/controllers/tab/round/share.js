// Integrate with share.tabroom.com rooms.
import { randomPhrase } from '@speechanddebate/nsda-js-utils';
import { getFollowers } from '../../../helpers/followers.js';
import { notify } from '../../../services/notifications/notify.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';

export async function makeShareRooms(req, res) {
	const counter = await shareRooms(req.params.roundId);
	return res.status(201).json({ message: `Successfully sent speech doc emails to ${counter} recipients` });
};

// Direct functional export because this also is called by cron.

/**
 * Opens a share.tabroom.com room for every panel in the round that has auto_docshare on
 * and no room yet, and invites the panel's judges and competitors through notify().
 * Replies route to the room because Reply-To is the room's address; the From can only
 * follow once blast() writes an email row. Returns how many email jobs were queued
 */
export const shareRooms = async (roundId) => {

	const { rows: sections } = await sql`
		select
			distinct panel.id id, panel.letter letter,
			tourn.id tournId, tourn.name tournName, round.label roundLabel, round.name roundName,
			auto_docshare.value autoShareEnabled
		from (panel, round, event, tourn)

			left join event_setting auto_docshare
				on auto_docshare.tag = 'auto_docshare'
				and auto_docshare.event = event.id

		where panel.round = ${roundId}
			and panel.bye = 0
			and NOT EXISTS (
				select ps.id
				from panel_setting ps
				where ps.tag = 'share'
				and ps.panel = panel.id
			)
			and panel.round = round.id
			and round.event = event.id
			and event.tourn = tourn.id
	`.execute(kdb);

	let counter = 0;

	for (const section of sections) {

		if (!section.autoShareEnabled) continue;

		const phrase = randomPhrase();

		await kdb.insertInto('panel_setting')
			.values({ panel: section.id, tag: 'share', value: phrase })
			.onDuplicateKeyUpdate({ value: phrase })
			.execute();

		// The panel's judges and competitors themselves; followers are not in the room
		const ids = await getFollowers({
			panelId     : section.id,
			noFollowers : true,
		});

		if (ids.length < 1) continue;

		let messageText = `Share speech documents for this round (10mb limit, docs only) by replying to`;
		messageText += ` this email with a file attachment, or going to https://share.tabroom.com/${phrase} \n`;

		let messageHTML = `<p>Share speech documents for this round (10mb limit, docs only) by replying to`;
		messageHTML += ` this email with a file attachment, or going to `;
		messageHTML += `<a href="https://share.tabroom.com/${phrase}">https://share.tabroom.com/${phrase}</a></p>`;

		const response = await notify({
			ids,
			subject  : `${section.tournName} ${section.roundLabel || `Round ${section.roundName}`} (${phrase}) - Speech Documents`,
			text     : messageText,
			html     : messageHTML,
			from     : 'Tabroom Share <share@share.tabroom.com>',
			replyTo  : `${phrase}@share.tabroom.com`,
			tourn    : section.tournId,
			// The invite asks for a reply with a file, which only email can carry
			channels : { inbox: false, webpush: false },
		});

		counter += response.email;
	}

	return counter;
};
