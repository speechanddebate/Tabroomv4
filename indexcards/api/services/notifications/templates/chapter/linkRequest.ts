import config from '../../../../config.js';
import { html } from '../html.js';

// The roster pages are still classic's; schemats has no page for approving a request
const ROSTER_PAGE = { judge: 'judges.mhtml', competitor: 'students.mhtml' } as const;

/**
 * Tells a chapter's admins that someone asked to be linked to a judge or competitor on their
 * roster, with the roster page where they approve it. Doing nothing leaves the request unapproved
 */
export function linkRequest({ record, name, chapter, requester }: {
	record: keyof typeof ROSTER_PAGE;
	/** The judge or competitor on the roster */
	name: string;
	chapter: number;
	requester: { first: string | null; last: string | null; email: string };
}) {
	const link = new URL(`/user/chapter/${ROSTER_PAGE[record]}?chapter_id=${chapter}`, config.classic.url).href;

	return {
		subject: `${requester.email} requests access to ${record} ${name}`,
		html: html`<p>${[requester.first, requester.last].filter(Boolean).join(' ')} (${requester.email}) has asked for online access to updates, ballots, and texts for ${record} ${name} on your team roster.</p>
<p>If they are the same person, approve the request on your team roster.</p>
<p style="text-align: center;"><a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #016f94; color: #ffffff; font-weight: bold; text-decoration: none; border-radius: 4px;">Review request</a></p>
<p>If this isn't authorized, you don't need to do anything.</p>`,
	};
}
