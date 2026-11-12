import { relations } from './relations.js';

type Policy = {
	[R in keyof typeof relations]?: Record<string, (keyof typeof relations[R])[]>;
};

/**
 * who may do what: each action lists the relations that allow it. This table is the source of truth of the authorization rules.
 * the can check will stop at the first matching rule so list the most common relation first in the policy.
 */
export const policy = {
	tourn: {
		staff: ['tournStaff'],
		read: ['tournStaff', 'circuitAdmin'],
		check: ['tournTab', 'tournChecker'],
		write: ['tournTab'],
		owner: ['tournOwner'],
	},
	category: {
		read: ['tournTab', 'categoryTab', 'tournChecker', 'categoryChecker'],
		check: ['tournTab', 'categoryTab', 'tournChecker', 'categoryChecker'],
		write: ['tournTab', 'categoryTab'],
	},
	event: {
		read: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
		check: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
		write: ['tournTab', 'eventTab'],
	},
	round: {
		read: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
		write: ['tournTab', 'eventTab'],
	},
	panel: {
		read: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
		check: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
	},
	timeslot: {
		read: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
		write: ['tournTab'],
	},
	entry: {
		read: ['competitor', 'coach', 'tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
		write: ['coach', 'tournTab', 'eventTab'],
		// marking the entry present at the tourn (classic's entry.active)
		activate: ['tournTab', 'eventTab', 'tournChecker', 'eventChecker'],
		flip: ['competitor', 'coach', 'tournTab', 'eventTab'],
		prefs: ['coach', 'prefsCoach', 'selfPrefs'],
		// joining the entry's online room as an observer, for campus rounds that allow them
		observe: ['coach'],
	},
	school: {
		read: ['coach', 'tournTab'],
		write: ['coach', 'tournTab'],
		dashboard: ['coach', 'tournTab', 'schoolContact'],
	},
	chapter: {
		read: ['coach', 'prefsCoach'],
		write: ['coach'],
		prefs: ['coach', 'prefsCoach'],
	},
	student: {
		read: ['coach', 'self'],
		write: ['coach'],
		self: ['self'],
	},
	judge: {
		read: ['self', 'tournTab', 'categoryTab', 'tournChecker', 'categoryChecker'],
		write: ['tournTab', 'categoryTab'],
		activate: ['tournTab', 'categoryTab', 'tournChecker', 'categoryChecker'],
		conflicts: ['self', 'tournTab', 'categoryTab'],
	},
	jpool: {
		read: ['tournTab', 'categoryTab', 'tournChecker', 'categoryChecker'],
		write: ['tournTab', 'categoryTab'],
	},
	circuit: {
		read: ['circuitAdmin'],
		write: ['circuitAdmin'],
	},
	region: {
		read: ['regionAdmin', 'circuitAdmin'],
		write: ['regionAdmin', 'circuitAdmin'],
	},
	district: {
		read: ['districtChair', 'districtMember'],
		write: ['districtChair'],
		worlds: ['districtChair', 'districtMember', 'districtWsdc'],
	},
	ballot: {
		read: ['judgeSelf', 'tournTab', 'eventTab'],
		write: ['judgeSelf', 'tournTab', 'eventTab'],
	},
} satisfies Policy;
