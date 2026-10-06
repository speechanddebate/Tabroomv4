
import circuitRepo from './circuitRepo.js';
import { faker } from '@faker-js/faker';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';
describe('buildCircuitQuery', () => {
	it('includes settings when requested', async () => {
		const settings = { exampleSetting: 'exampleValue' };
		const Circuit = await circuitRepo.createCircuit(db,{ settings });
		const circuit = await circuitRepo.getCircuit(db,
			Circuit.id,
			{ settings: true }
		);

		expect(circuit).toBeDefined();
		expect(circuit?.settings).toBeDefined();
		expect(circuit?.settings?.exampleSetting).toBe('exampleValue');
	});
	it('filters inactive circuits when opts.active is true', async () => {
		const inactiveCircuit = await factories.circuit.create({ active: 0 });

		const circuit = await circuitRepo.getCircuit(db,inactiveCircuit.id, { active: true });
		expect(circuit).toBeUndefined(); // since the inactive circuit should not be returned
	});
});
describe('getCircuits', () => {
	it('should return an empty array if no circuits exist for a tourn', async () => {
		const circuits = await circuitRepo.getCircuits(db,{ tourn: 999999 }); // unlikely sectionId
		expect(Array.isArray(circuits)).toBe(true);
		expect(circuits.length).toBe(0);
	});
	it('should return circuits for a given circuitId', async () => {
		const Circuit = await circuitRepo.createCircuit(db,{});
		const circuits = await circuitRepo.getCircuits(db);
		expect(Array.isArray(circuits)).toBe(true);
		expect(circuits.length).toBeGreaterThan(0);
		const found = circuits.find(b => b.id === Circuit.id);
		expect(found).toBeDefined();
	});
});
describe('getActiveCircuits', () => {
	it('should throw an error if startDate or endDate is missing', async () => {
		// @ts-expect-error Testing runtime validation of an invalid endDate
		await expect(circuitRepo.getActiveCircuits(db, { startDate: faker.date.past(), endDate: undefined }))
			.rejects.toThrow('getActiveCircuits: startDate and endDate are required');
			// @ts-expect-error Testing runtime validation of an invalid startDate
		await expect(circuitRepo.getActiveCircuits(db, { startDate: undefined, endDate: faker.date.future() }))
			.rejects.toThrow('getActiveCircuits: startDate and endDate are required');
	});
	it('should return active circuits within a date range', async () => {
		const Circuit = await factories.circuit.create();
		await factories.tourn.create({ circuit: Circuit.id, start: new Date() });
		await factories.tourn.create({ circuit: Circuit.id, start: new Date() });
		const circuits = await circuitRepo.getActiveCircuits(db,{ startDate: faker.date.past(), endDate: faker.date.future() });
		expect(Array.isArray(circuits)).toBe(true);
		const circuit = circuits.find(c => c.id === Circuit.id);

		expect(circuit).toBeDefined();
		expect(circuit!.tourns).toBe(2);

	});
	it('should apply state and country filters', async () => {
		const noLocale = await factories.circuit.create({
			country: null,
			state: null,
		});
		await factories.tourn.create({ circuit: noLocale.id, start: new Date() });
		const rightState = await factories.circuit.create({ state: 'MN', country: 'US'});
		await factories.tourn.create({ circuit: rightState.id, start: new Date() });
		const wrongState = await factories.circuit.create({ state: 'WI', country: 'US'});
		await factories.tourn.create({ circuit: wrongState.id, start: new Date() });
		const wrongCountry = await factories.circuit.create({ state: 'MN', country: 'CA'});
		await factories.tourn.create({ circuit: wrongCountry.id, start: new Date() });

		let res = await circuitRepo.getActiveCircuits(db,{
			startDate: faker.date.past(),
			endDate: faker.date.future(),
			state: 'MN',
			country: 'US',
		});
		expect(res).toBeDefined();
		//expect to contain rightState and none of the others
		expect(res.some(c => c.id === rightState.id)).toBe(true);
		expect(res.some(c => c.id === noLocale.id)).toBe(false);
		expect(res.some(c => c.id === wrongState.id)).toBe(false);
		expect(res.some(c => c.id === wrongCountry.id)).toBe(false);

		res = await circuitRepo.getActiveCircuits(db,{
			startDate: faker.date.past(),
			endDate: faker.date.future(),
			country: 'US',
		});
		expect(res).toBeDefined();
		expect(res.some(c => c.id === rightState.id)).toBe(true);
		expect(res.some(c => c.id === noLocale.id)).toBe(false);
		expect(res.some(c => c.id === wrongState.id)).toBe(true);
		expect(res.some(c => c.id === wrongCountry.id)).toBe(false);

		res = await circuitRepo.getActiveCircuits(db,{
			startDate: faker.date.past(),
			endDate: faker.date.future(),
			state: 'WI',
		});
		expect(res).toBeDefined();
		expect(res.some(c => c.id === rightState.id)).toBe(false);
		expect(res.some(c => c.id === noLocale.id)).toBe(false);
		expect(res.some(c => c.id === wrongState.id)).toBe(true);
		expect(res.some(c => c.id === wrongCountry.id)).toBe(false);
		});
	it('does not return circuits outside the date range', async () => {
		const Circuit = await factories.circuit.create();
		await factories.tourn.create({ circuit: Circuit.id, start: new Date() });
		const circuits = await circuitRepo.getActiveCircuits(db,{ startDate: faker.date.future(), endDate: faker.date.future() });
		expect(circuits.some(c => c.id === Circuit.id)).toBe(false);
	});
	});
describe('createCircuit', () => {
	it('should create a circuit and retrieve it', async () => {
		const Circuit = await circuitRepo.createCircuit(db, {});

		//ensure that id, updatedAt and createdAt are present and not null
		expect(Circuit).toHaveProperty('id');
		expect(Circuit.id).not.toBeNull();
		expect(Circuit.timestamp).not.toBeNull();
		expect(Circuit.created_at).not.toBeNull();
	});
	it('should create a circuit with settings and retrieve it', async () => {
		const settings = { exampleSetting: 'exampleValue' };
		const created= await circuitRepo.createCircuit(db, { settings });
		const circuit = await circuitRepo.getCircuit(db,
			created.id,
			{ settings: true }
		);

		expect(circuit).toBeDefined();
		expect(circuit!.settings).toBeDefined();
		expect(circuit!.settings?.exampleSetting).toBe('exampleValue');
	});
});