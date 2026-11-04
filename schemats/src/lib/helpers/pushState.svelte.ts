/**
 * Push notification state and actions for the current browser and login, shared by the home
 * page prompt and the profile page. Call createPushState() during component setup: it creates
 * TanStack queries and reads the session context.
 *
 * The page-load sync is not here. The root layout runs syncPush() once per login, so every
 * page keeps this browser's subscription current without mounting this state.
 */
import { useQueryClient } from '@tanstack/svelte-query';
import {
	createUserNotifyPush,
	createUserNotifyPushSubscribe,
	createUserNotifyPushTest,
	createUserNotifyPushUnsubscribe,
	getUserNotifyPushQueryKey,
	getUserSessionsQueryKey,
} from '$indexcards';
import { handleMutation, handleOrval } from '$lib/helpers/query';
import { isSuSession } from '$lib/helpers/SessionContext.svelte';
import { toast } from '$lib/helpers/toasts';
import { isPushSupported, subscribeBrowser, unsubscribeBrowser } from '$lib/helpers/webpush';

export type Permission = NotificationPermission | 'unsupported';

/**
 * Where push stands for this browser and login:
 * - unsupported: this browser can't do web push
 * - su: an su'd session, which can't change push
 * - unavailable: push isn't configured on the server
 * - denied: notifications are blocked for this site in the browser
 * - on: this login gets push
 * - off: push was turned off for this login
 * - undecided: none of the above, so the person can turn it on
 */
export type PushState = 'unsupported' | 'su' | 'unavailable' | 'denied' | 'on' | 'off' | 'undecided';

/** The browser's notification permission, or unsupported when it can't do web push */
export const readPermission = (): Permission => {
	if (!isPushSupported()) {
		return 'unsupported';
	}
	return Notification.permission;
};

export function createPushState() {
	const queryClient = useQueryClient();
	// Push status changes under the page (another tab, the profile page), so never show a persisted copy
	const pushQuery = createUserNotifyPush(() => ({ query: { meta: { persist: false } } }));
	const subscribeMutation = createUserNotifyPushSubscribe();
	const unsubscribeMutation = createUserNotifyPushUnsubscribe();
	const testMutation = createUserNotifyPushTest();

	// null until read in the browser, so the server render doesn't guess the browser's state
	let permission = $state<Permission | null>(null);
	let working = $state(false);

	const status = $derived(handleOrval(pushQuery, {
		Problem: (problem, callDefault) => {
			// 503 means push isn't configured on the server; callers show that through the state
			if (problem.status !== 503) {
				callDefault(problem);
			}
		},
	}));

	const state = $derived.by((): PushState | null => {
		if (permission === null) {
			return null;
		}
		if (permission === 'unsupported') {
			return 'unsupported';
		}
		if (isSuSession()) {
			return 'su';
		}
		if (pushQuery.data?.status === 503) {
			return 'unavailable';
		}
		if (permission === 'denied') {
			return 'denied';
		}
		if (!status) {
			return null;
		}
		if (status.disabled) {
			return 'off';
		}
		if (status.endpoint && permission === 'granted') {
			return 'on';
		}
		return 'undecided';
	});

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: getUserNotifyPushQueryKey() }),
			queryClient.invalidateQueries({ queryKey: getUserSessionsQueryKey() }),
		]);
	};

	/** Runs a push step, turning a thrown browser error into a toast. Returns whether the step succeeded */
	const attempt = async (label: string, step: () => Promise<boolean>): Promise<boolean> => {
		working = true;
		try {
			return await step();
		} catch (err) {
			console.error(`${label} failed`, err);
			toast.error({ message: `${label} failed`, detail: err instanceof Error ? err.message : String(err) });
			return false;
		} finally {
			working = false;
			permission = readPermission();
		}
	};

	/**
	 * Asks for notification permission if needed, subscribes this browser, and turns push on for
	 * this login. Must run from a user gesture: browsers ignore permission requests without one.
	 * Returns false when permission was not granted or the server didn't take the subscription
	 */
	const enable = () => attempt('Turning on notifications', async () => {
		if (!status) {
			return false;
		}
		const browser = await subscribeBrowser(status.publicKey);
		if (!browser) {
			return false;
		}
		const saved = await handleMutation(subscribeMutation.mutateAsync({
			data: { subscription: browser.json, enable: true },
		}));
		await refresh();
		return saved !== null;
	});

	/** Turns push off for this login and drops this browser's subscription */
	const turnOff = () => attempt('Turning off notifications', async () => {
		const removed = await handleMutation(unsubscribeMutation.mutateAsync());
		if (removed === null) {
			return false;
		}
		if (isPushSupported()) {
			await unsubscribeBrowser();
		}
		await refresh();
		return true;
	});

	/**
	 * Has the API queue one push to this login. The API's problem detail (no subscription, push
	 * not configured, queue down, rate limit) is shown as the error toast. Returns whether it was queued
	 */
	const sendTest = async (): Promise<boolean> => {
		let conflict = false;
		const sent = await handleMutation(testMutation.mutateAsync(), {
			Problem: (problem, callDefault) => {
				conflict = problem.status === 409;
				callDefault(problem);
			},
		});
		if (sent === null) {
			// The subscription is gone or push is off for this login, so the toggle is out of date
			if (conflict) {
				await refresh();
			}
			return false;
		}
		toast.success({ message: 'Test notification sent. It should appear in a few seconds.' });
		return true;
	};

	return {
		get permission() { return permission; },
		get status() { return status; },
		get state() { return state; },
		get busy() {
			return working || subscribeMutation.isPending || unsubscribeMutation.isPending || testMutation.isPending;
		},
		/** Reads the browser's permission. Call from onMount: it is browser only */
		readPermission: () => { permission = readPermission(); },
		enable,
		turnOff,
		sendTest,
		refresh,
	};
}
