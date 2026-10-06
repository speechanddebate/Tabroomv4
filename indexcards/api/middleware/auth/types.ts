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
