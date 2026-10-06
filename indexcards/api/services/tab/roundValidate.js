/* Checks the ballots in a given round to see if there are empty entries, empty
 * judges, side mismatches, chair mismatches, and the like.
 *
 * This code dedicated to Ellen Zwarensteyn.
 *
 */

import { db } from '../../data/database.js';

export const checkBallots = async (roundId) => {

	const ballots = await db
	.selectFrom('ballot')
	.innerJoin('panel', 'panel.id', 'ballot.panel')
	.select([
		'ballot.id',
		'ballot.entry',
		'ballot.judge',
		'ballot.chair',
		'ballot.speakerorder',
		'ballot.side',
		'ballot.panel as sectionId',
	])
	.where('panel.round', '=', roundId)
	.execute();

	// First create a reference sample of what a complete section looks like.
	// If there are discrepancies there's no good way for Tabroom to tell so
	// the first record wins.

	const sections = {};

	ballots.forEach( ballot => {
		if (!sections[ballot.sectionId]) {
			sections[ballot.sectionId] = {
				judges       : {},
				entries      : {},
			};
		}

		const section = sections[ballot.sectionId];

		if (!section.judges[ballot.judge]) {
			section.judges[ballot.judge] = {
				chair   : ballot.chair,
				entries : [],
				ballots : [],
			};
		}

		section.judges[ballot.judge].entries.push(ballot.entry);
		section.judges[ballot.judge].ballots.push(ballot);

		if (!section.entries[ballot.entry]) {
			section.entries[ballot.entry] = {
				side         : ballot.side,
				speakerorder : ballot.speakerorder,
				judges       : [],
				ballots      : [],
			};
		}

		section.entries[ballot.entry].judges.push(ballot.judge);
		section.entries[ballot.entry].ballots.push(ballot);
	});

	const missing = [];

	Object.keys(sections).forEach( sectionId => {

		const section = sections[sectionId];

		// Check that every entry has every judge
		Object.keys(section.judges).forEach( judgeId => {
			Object.keys(section.entries).forEach( entryId => {
				if (!section.entries[entryId].judges.includes(judgeId)) {
					const reference = section.entries[entryId].ballots[0];
					missing.push({
						...reference,
						judge: judgeId,
					});
				}
			});
		});

		// Check that every judge has every entry
		Object.keys(section.entries).forEach( entryId => {
			Object.keys(section.judges).forEach( judgeId => {
				if (!section.judges[judgeId].entries.includes(entryId)) {
					const reference = section.judges[judgeId].ballots[0];
					missing.push({
						...reference,
						entry: entryId,
					});
				}
			});
		});

	});

	// Update all ballots to reflect the sides in the reference case

	// Update all ballots to reflect the speakerorder in the reference case

	// Eliminate any ballots with missing entry and judge

	// Create any ballots that are in the missing references
};
