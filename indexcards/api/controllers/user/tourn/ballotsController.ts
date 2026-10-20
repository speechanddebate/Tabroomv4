import type { Request, Response } from 'express';
import { getPerson } from '../../../middleware/auth/authorization.js';
import type { CurrentBallot } from '@tabroom/types';
import panelRepo from '../../../repos/panelRepo.js';
import { db } from '../../../data/database.js';
import { getSectionRoom } from '../../../services/onlineRooms/onlineRoomService.js';

export async function getCurrent(req: Request,res: Response) {
	const person = getPerson(req);
	const { tournId } = req.params;
	const sections = await panelRepo.getCurrentBallots(db,person.id,Number(tournId));

	let ballots: CurrentBallot[] = [];

	sections.forEach(s => {
		// Judges see a round once it's published, or released to judges only (classic's
		// "Publish ballots but not schematic"), the same rule as the ballot routes' judgePolicy
		if (!s.Round.published && !s.Round.settings.judges_ballots_visible) {
			return;
		}
		if(s.Ballots.some((b: { audit: number }) => b.audit)){
			if(
				s.Ballots.every((b: { chair: number }) => b.chair !== 1) && 
				s.Judge.Category.Event.type !== 'mock_trial' && 
				s.Judge.Category.Event.type !== 'congress' &&
				Date.now() < s.Round.Timeslot.end
			){ 
				return;
			}
		}
		if(s.Judge.Category.Event.settings.online_mode === 'async' && s.Round.Timeslot.end < Date.now()){
			return;
		}

		// oxlint-disable-next-line no-explicit-any
		function addFlightOffset(iso: string,section: any) {
			const date = new Date(iso);
			let add = 0;
			if (section.Round.flighted){
				add = (section.flight - 1) * (section.Judge.Category.Event.settings.flight_offset ?? 0);
			}
			date.setMinutes(date.getMinutes() + add);
			return date.toISOString();
		}
		
		function getStatus(s: { scored: boolean; Ballots: { judge_started: boolean }[] }) {
			if (s.scored){
				return "scored"
			} else if (s.Ballots.some((b: { judge_started: boolean }) => b.judge_started)){
				return 'started'
			}
			return "not_started"
		}

		ballots.push({
			id: s.id,
			name: s.Round.name,
			label: s.Round.label,
			flight: s.Round.flighted ? s.flight : null,
			flipStatus: s.settings.flip_status,
			status: getStatus(s),
			startText: s.Judge.Category.Event.settings.start_button,
			ballotText: s.Judge.Category.Event.settings.start_button_text,
			show_async: s.settings.show_async === 1,
			onlineBallots: s.Judge.Category.Event.settings.online_ballots ?? false,
			legion: s.Judge.Category.Tourn.settings.legion === 1,
			start: new Date(s.Round.start ? addFlightOffset(s.Round.start,s): addFlightOffset(s.Round.Timeslot.start,s)).toISOString(),
			deadline: new Date(s.Round.end ? addFlightOffset(s.Round.end,s): addFlightOffset(s.Round.Timeslot.end,s)).toISOString(),
			roomId: s.Room.id,
			Room: null,
			roomNotes: s.Round.settings.judges_ballots_visible ? s.Room.notes : null,
			chair: s.Ballots.some((b: { chair: number }) => b.chair),
			audited: s.Ballots.some((b: { audit: number }) => b.audit),
			tourn: s.Judge.Category.Tourn.id,
			TournTz: s.Judge.Category.Tourn.tz,
			eventName: s.Judge.Category.Event.name,
			eventAbbr: s.Judge.Category.Event.abbr,
			eventType: s.Judge.Category.Event.type,
			onlineMode: s.Judge.Category.Event.settings.online_mode,
			JudgeId: s.Judge.id,
			RoundId: s.Round.id,
			Entries: s.Entries.map((e: { id: string; code: string }) => {
				let ballot = s.Ballots.find((b: { entry: string }) => b.entry === e.id)
				let side = null;
				if (!s.settings.flip_status || s.settings.flip_status === 'done'){
					const eventSettings = s.Judge.Category.Event.settings;
					if (ballot.side === 1){
						side = eventSettings.aff_label ?? "Aff";
					}
					if (ballot.side === 2){
						side = eventSettings.neg_label ?? "Neg";
					}
				}
				let speakerOrder = ballot.speakerOrder ? JSON.parse(ballot.speakerOrder) : null;
				return {
					id: e.id,
					code: e.code,
					side,
					speakerOrder,
				};
			}),
		});
		return;
	});

	// Each ballot's room as this person sees it, so the join button needs no request of its own
	await Promise.all(ballots.map(async (ballot) => {
		ballot.Room = (await getSectionRoom(db, ballot.tourn, ballot.id, req.actor))?.display ?? null;
	}));

	return res.json(ballots);
}

export default {
	getCurrent,
}
