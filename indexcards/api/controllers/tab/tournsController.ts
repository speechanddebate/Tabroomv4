import tournRepo from '../../repos/tournRepo.js';
import { createPermission } from '../../repos/permissionRepo.js';
import type { Request, Response } from 'express';
import { BadRequest, NotFound } from '../../helpers/problem.js';
import { db } from '../../data/database.js';

async function getTourn(req: Request, res: Response) {
	const { tournId } = req.params;
	if(!tournId) return BadRequest(req,res,'Tournament ID is required');
	const tourn = await tournRepo.getTourn(tournId as string, { settings: true, unpublished: true });
	if (!tourn) return NotFound(req, res, 'Tournament not found');
	return res.json(tourn);
}

async function createTourn(req: Request, res: Response) {
	//TODO need to make the requesting user the owner of the tourn
	const data = req.body;
	const tournId = await tournRepo.createTourn(data);
	//TODO this should be handled and validated by a middleware plugin
	if(!req.actor.Person?.id) return BadRequest(req,res,'Actor person ID is required');
	await createPermission(db, {
		tourn: tournId,
		person: req.actor.Person?.id,
		tag: 'owner',
	});
	const tourn = await tournRepo.getTourn(tournId);
	return res.status(201).json(tourn);
}

async function updateTourn(req: Request, res: Response) {
	const { tournId } = req.params;
	if (!tournId) return BadRequest(req, res, 'Tournament ID is required');

	const updates = req.body;
	delete updates.id;

	await tournRepo.updateTourn(tournId, updates);

	const updatedTourn = await tournRepo.getTourn(tournId as string);
	return res.json(updatedTourn);
}

async function deleteTourn(req: Request, res: Response) {
	const { tournId } = req.params;
	if (!tournId) return BadRequest(req, res, 'Tournament ID is required');

	await tournRepo.deleteTourn(tournId as string);

	return res.status(204).send();
}

export default {
	getTourn,
	createTourn,
	updateTourn,
	deleteTourn,
};