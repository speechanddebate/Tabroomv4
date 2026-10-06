import { createContext } from 'svelte';
import type { Session } from '$indexcards/schemas';
import type { Session as SessionSchema } from '@tabroom/types';

// a session carries only a subset of Person
type SessionPerson = SessionSchema['Person'];

type SessionState = {
	Person: SessionPerson | null;
	Su?: SessionPerson | null;
}

const [getSessionState, setSessionState] = createContext<SessionState>();

function toSessionState(session: Session | null): SessionState {
	if (!session) {
		return { Person: null };
	}
	return { Person: session.Person ?? null, Su: session.Su };
}

export function initSessionContext(get: () => Session | null) {
	const state = $state<SessionState>(toSessionState(get()));
	setSessionState(state);

	$effect(() => {
		const session = get();
		const nextState = toSessionState(session);
		state.Person = nextState.Person;
		state.Su = nextState.Su;
	});

	return state;
}

export function getSession(){
	return getSessionState();
}
/**
 * Returns the current "active" person, if this is an Su session, this will be the impersonated user
 */
export function getPerson() {
	const state = getSessionState();
	return state.Person;
}
/**
 * Returns the root person of the session, this will always be the authenticated person.
 * Use for case when you need the original user regardless of impersonation.
 */
export function getSessionOwner() {
	const state = getSessionState();
	return state.Su ?? state.Person;
}

export function isAuthenticated() {
	const state = getSessionState();
	return !!(state.Su ?? state.Person);
}
export function isSuSession() {
	const state = getSessionState();
	return !!state.Su;
}