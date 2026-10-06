import type { Database } from '../../data/database.js';

export type AuthError = Error & {
	status: number;
	code: string;
	message: string;
};

/** a single permission loaded into the auth context for evaluation */
export type Perm = {
	scope: string;
	id: number;
	role: string;
	categoryId?: number;
	tournId?: number;
};

/** the person record attached to an authenticated session */
export type SessionPerson = {
	id: number;
	first: string | null;
	last: string | null;
	email: string;
	site_admin: number | null;
	tz?: string | null;
};

type ActorMethods = {
	can: (resource: string, action: string, resourceId: number) => Promise<boolean>;
	assert: (resource: string, action: string, resourceId: number) => Promise<void>;
	allowedIds: (resource: string, action: string, opts?: Record<string, unknown>) => { all: boolean; ids: number[] };
	/** add perms to the set evaluated by can/assert/allowedIds. no-op for anonymous actors */
	grant: (perms: Perm[]) => void;
};

export type PersonActor = ActorMethods & {
	type: 'person';
	id: number;
	Person: SessionPerson;
};

export type AnonymousActor = ActorMethods & {
	type: 'anonymous';
	id?: undefined;
	Person?: undefined;
};

/** who is acting on a request. check every authorization decision against this */
export type Actor = PersonActor | AnonymousActor;

/** how a request authenticated. add a member here with each new strategy */
export type AuthMethod = 'cookie' | 'none';

/** facts about how the request authenticated, as opposed to who is acting (Actor) */
export type AuthInfo = {
	method: AuthMethod;
	/** the session id when authenticated with a session cookie */
	sessionId: number | null;
	/** the admin who su'd into this account */
	su: SessionPerson | null;
};

/** the framework agnostic parts of a request a strategy can read credentials from */
export type AuthInput = {
	cookies: Record<string, string | undefined>;
	headers: Record<string, string | string[] | undefined>;
};

export type AuthResult =
	/** the strategy found no credentials it handles. try the next strategy */
	| { status: 'none' }
	/** credentials were present but invalid. the request continues anonymously */
	| { status: 'invalid'; clearCookie?: boolean }
	/** credentials were valid but the principal may not use the api */
	| { status: 'forbidden'; detail: string }
	| { status: 'success'; auth: AuthInfo; person: SessionPerson };

/** a way of authenticating a request, e.g. session cookie or api key */
export type AuthStrategy = (db: Database, input: AuthInput) => Promise<AuthResult>;
