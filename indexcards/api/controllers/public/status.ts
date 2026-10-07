import os from 'os';
import config from '../../config.js';
import packageData from '../../../package.json' with { type: 'json' };
import type { Request, Response } from 'express';

export function systemStatus(req: Request, res: Response) {
	return res.status(200).json({
		message  : 'OK',
		name     : packageData.name,
		version  : packageData.version,
		commit   : process.env.GIT_COMMIT || 'development',
		webhost  : config.dockerhost ?? 'undefined',
		server   : os.hostname(),
		load     : os.loadavg(),
		uptime   : os.uptime(),
		freemem  : os.freemem(),
		totalmem : os.totalmem(),
		node     : process.version,
		runtime  : process.env?.NODE_ENV,
		database : config.db.database,
	});
};

export function barf(req: Request, res: Response) {
	throw new Error('OMG, we are not happy, because an error has happened!');
};

export default systemStatus;
