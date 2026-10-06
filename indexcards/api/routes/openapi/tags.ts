//Try to keep tags in alphabetical order
type TagObject = {
	name: string;
	description?: string;
};

export const tags: TagObject[] = [
	{
		name: 'Admin : Servers',
		description: 'Administrative functions for managing Tabroom servers',
	},
	{
		name: 'Admin : Mail',
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
		name: 'Backup and Restore',
		description: 'Endpoints for managing tournament backups and restores',
	},
	{
		name: 'User: Inbox',
		description: 'Endpoints for managing user inbox messages',
	},
	{
		name: 'Push Notifications',
		description: 'Endpoints for managing user push notifications',
	},
	{
		name: 'Tournament',
		description: 'Endpoints for managing tournaments',
	},
	{
		name: 'Category',
		description: 'Endpoints for managing categories within tournaments',
	},
	{
		name: 'User: Session',
		description: 'Endpoints related to a users session',
	},
	{
		name: 'Sites & Rooms',
		description: 'Endpoints for managing sites and rooms within tournaments',
	},
	{
		name: 'Schools',
		description: 'Endpoints for managing schools within tournaments',
	},
	{
		name: 'Timeslots',
		description: 'Endpoints for managing timeslots within tournaments',
	},
	{
		name: 'Tournaments',
		description: 'Endpoints for managing tournaments',
	},
];

export const declaredTagGroups = [
	{
		name: 'Admin',
		tags: [
			'Admin : Servers',
			'Admin : Mail',
		],
	},
	{
		name: 'Tournament Management',
		tags: [
			'Tournament',
			'Timeslots',
			'Backup and Restore',
			'Category',
			'Sites & Rooms',
			'Schools',
		],
	},
	{
		name: 'User',
		tags: [
			'User: Inbox',
			'User: Session',
			'User: Chapter',
			'User: Tournament',
			'User: Chapter',
			'User: Judge'
		],
	},
];