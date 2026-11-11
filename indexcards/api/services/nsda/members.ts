import z from 'zod';
import { fetchNSDA } from './fetchNSDA.js';

/**
 * An NSDA member as GET /members/{id} sends it, cut down to who they are. The API sends much
 * more (points, degree, honors, contact details); add a field here when something reads it.
 * The email is only there for an API user with admin rights, or for the member themself
 */
export const MemberSchema = z.object({
	/** The NSDA member id */
	person_id: z.coerce.number().int().positive(),
	first: z.string().nullish(),
	middle: z.string().nullish(),
	last: z.string().nullish(),
	/** Their NSDA login */
	email: z.string().nullish(),
});

export type Member = z.infer<typeof MemberSchema>;

/**
 * The NSDA member with this id, or null if the NSDA has no such member. For an id it does
 * not have, the API still answers with an object, one with no member id or name in it; that
 * comes back as null here. Throws when the request fails (NSDAError)
 */
export async function getMember(id: number): Promise<Member | null> {
	const member = MemberSchema.safeParse(await fetchNSDA(`/members/${id}`));
	return member.success ? member.data : null;
}

/**
 * One line of an NSDA member search (GET /search?type=members), cut down to who the member
 * is. The API also sends their role and school, one line for each role they hold, so the
 * same id can repeat; add a field here when something reads it
 */
export const MemberSearchResultSchema = z.object({
	/** The NSDA member id */
	id: z.coerce.number().int().positive(),
	first: z.string().nullish(),
	last: z.string().nullish(),
	/** First and last name together */
	name: z.string().nullish(),
});

export type MemberSearchResult = z.infer<typeof MemberSearchResultSchema>;

/**
 * The NSDA member whose NSDA login is this email, or null if there is none. A member with
 * several roles comes back from the search once per role; this is the first of those lines.
 * The search only matches on email for an API user with admin rights, and it matches the
 * whole address. Throws when the request fails (NSDAError) or the answer is not a list
 */
export async function getMemberByEmail(email: string): Promise<MemberSearchResult | null> {
	const response = await fetchNSDA(`/search?q=${encodeURIComponent(email)}&type=members`);

	if (!Array.isArray(response)) {
		throw new Error('NSDA member search did not return a list');
	}

	const first = MemberSearchResultSchema.safeParse(response[0]);
	return first.success ? first.data : null;
}
