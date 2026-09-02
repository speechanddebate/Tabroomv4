import type { ZodOpenApiSchemaObject } from 'zod-openapi';

export const TournInviteSchema = {
	allOf: [
		{ $ref: '#/components/schemas/Tourn' },
		{
			type: 'object',
			properties: {
				Webpages: {
					type: 'array',
					items: { $ref: '#/components/schemas/Webpage' },
				},
				Files: {
					type: 'array',
					items: { $ref: '#/components/schemas/File' },
				},
				Events: {
					type: 'array',
					items: { $ref: '#/components/schemas/EventInviteSchema' },
				},
				Contacts: {
					type: 'array',
					items: { $ref: '#/components/schemas/TournContact' },
				},
			},
		},
	],
} as const satisfies ZodOpenApiSchemaObject;
