import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

// Printable ASCII over https only. Which push service hosts are allowed is checked by the controller
const PushEndpointSchema = z.string()
	.max(1024)
	.regex(/^https:\/\/[\x21-\x7e]+$/)
	.refine(value => URL.canParse(value), { message: 'Invalid URL' });

export const PushSubscriptionSchema = z.object({
	endpoint: PushEndpointSchema.meta({ description: 'The push service URL that delivers messages to this browser' }),
	expirationTime: z.number().nullable().optional().meta({ description: 'When the subscription expires, in milliseconds since the epoch, or null if it does not' }),
	keys: z.object({
		p256dh: z.string().length(87).regex(BASE64URL).meta({ description: 'The browser\'s P-256 public key, unpadded base64url' }),
		auth: z.string().length(22).regex(BASE64URL).meta({ description: 'The browser\'s authentication secret, unpadded base64url' }),
	}).strict().meta({ description: 'The keys used to encrypt messages to this browser' }),
}).strict().meta({
	id: 'PushSubscription',
	description: 'A browser push subscription, as returned by PushSubscription.toJSON()',
}) satisfies ZodOpenApiSchemaObject;

export const PushSubscribeRequestSchema = z.object({
	subscription: PushSubscriptionSchema,
	replaces: PushEndpointSchema.optional().meta({ description: 'The endpoint of an earlier subscription from this browser that the new one replaces' }),
	enable: z.boolean().optional().meta({ description: 'Whether to turn push back on for this login if it was turned off' }),
}).strict().meta({
	id: 'PushSubscribeRequest',
	description: 'The push subscription to save for the current login',
}) satisfies ZodOpenApiSchemaObject;

export const PushStatusSchema = z.object({
	publicKey: z.string().meta({ description: 'The VAPID public key browsers subscribe with' }),
	endpoint: z.string().nullable().meta({ description: 'The push endpoint saved for the current login, or null if there is none for the current key' }),
	disabled: z.boolean().meta({ description: 'Whether push is turned off for the current login' }),
}).strict().meta({
	id: 'PushStatus',
	description: 'The push notification status of the current login',
}) satisfies ZodOpenApiSchemaObject;

export type PushSubscription = z.infer<typeof PushSubscriptionSchema>;
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequestSchema>;
export type PushStatus = z.infer<typeof PushStatusSchema>;
