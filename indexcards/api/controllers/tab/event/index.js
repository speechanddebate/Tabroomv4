import { NotImplemented, UnexpectedError } from '../../../helpers/problem.js';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/summon.js';

// General CRUD for the event itself
// Get event (read)
export async function getEvent(req, res) {
	const event = await summon(kdb, 'event',req.params.eventId);
	res.status(200).json(event);
}

// Update event (update). Never worked: it called update() on a plain object.
export async function updateEvent(req, res) {
	return NotImplemented(req, res, 'Updating an event is not yet implemented');
}

// Delete event
export async function deleteEvent(req, res) {
	try {
		await kdb.deleteFrom('event')
			.where('id', '=', req.params.eventId)
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}

	res.status(200).json({
		error: false,
		message: 'Event deleted',
	});
}

export default updateEvent;
