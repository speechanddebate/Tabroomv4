import type { TagObject } from 'openapi3-ts/oas32';

//Try to keep tags in alphabetical order
//Set `parent` to nest a tag under another tag in scalar
export const tags: TagObject[] = [
	{
		name: 'Admin',
		description: 'Administrative functions',
	},
	{
		name: 'Tournament Management',
		description: 'Endpoints for running a tournament',
	},
	{
		name: 'User',
		description: 'Endpoints for the logged in user',
	},
	{
		name: 'admin:servers',
		summary: 'Servers',
		parent: 'Admin',
		description: 'Administrative functions for managing Tabroom servers',
	},
	{
		name: 'admin:mail',
		summary: 'Mail',
		parent: 'Admin',
		description: 'Administrative functions for testing mail and notifications',
	},
	{
		name: 'Ads',
		description: 'Endpoints related to advertisements displayed on Tabroom',
	},
	{
		name: 'Auth',
		description: 'Authentication related endpoints',
	},
	{
		name: 'tab:backup-restore',
		summary: 'Backup and Restore',
		parent: 'Tournament Management',
		description: 'Endpoints for managing tournament backups and restores',
	},
	{
		name: 'user:inbox',
		summary: 'Inbox',
		parent: 'User',
		description: 'Endpoints for managing a user inbox messages',
	},
	{
		name: 'Push Notifications',
		description: 'Endpoints for managing user push notifications',
	},
	{
		name: 'tab:tournament',
		summary: 'Tournament',
		parent: 'Tournament Management',
		description: 'Endpoints for managing tournaments',
	},
	{
		name: 'tab:category',
		summary: 'Category',
		parent: 'Tournament Management',
		description: 'Endpoints for managing categories within tournaments',
	},
	{
		name: 'user:session',
		summary: 'Session',
		parent: 'User',
		description: 'Endpoints related to a users session',
	},
	{
		name: 'tab:sites-rooms',
		summary: 'Sites & Rooms',
		parent: 'Tournament Management',
		description: 'Endpoints for managing sites and rooms within tournaments',
	},
	{
		name: 'tab:schools',
		summary: 'Schools',
		parent: 'Tournament Management',
		description: 'Endpoints for managing schools within tournaments',
	},
	{
		name: 'tab:timeslots',
		summary: 'Timeslots',
		parent: 'Tournament Management',
		description: 'Endpoints for managing timeslots within tournaments',
	},
	{
		name: 'Tournaments',
		description: 'Endpoints for managing tournaments',
	},
	{
		name: 'user:chapter',
		summary: 'Chapter',
		parent: 'User',
		description: 'Endpoints for the chapters a user belongs to',
	},
	{
		name: 'user:judge',
		summary: 'Judge',
		parent: 'User',
		description: 'Endpoints for the judges linked to a user',
	},
	{
		name: 'user:tournament',
		summary: 'Tournament',
		parent: 'User',
		description: 'Endpoints for the tournaments a user is in',
	},
];
