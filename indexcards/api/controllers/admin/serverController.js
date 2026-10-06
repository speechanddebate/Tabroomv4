import axios from 'axios';
import { sql } from 'kysely';
import { db as kdb } from '../../data/database.js';
import { summon } from '../../repos/utils/summon.js';
import changeLogRepo from '../../repos/changeLogRepo.js';
import notify from '../../helpers/blast.js';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import {
	getLinodeInstances,
	getProxyStatus,
	increaseLinodeCount,
	decreaseLinodeCount,
	showTabroomUsage,
} from '../../helpers/servers.js';

// Moved the actual logic to a helper script so that these can be invoked on
// the command line from api/auto via node scaleServers.js increase 3 or
// node scaleServers show etc.

// Shows the instances that are currently alive according to the Linode API

export async function getInstances(req, res) {
	const tabroomMachines = await getLinodeInstances();
	return res.status(200).json(tabroomMachines);
};

// Shows CPU and memory load data from the machines themselves, as well as
// up/down data from the haproxy JSON dump.

export async function getInstanceStatus(req, res) {
	const proxyMachineStatus = await getProxyStatus([]);
	return res.status(200).json(proxyMachineStatus);
};

export async function getInstanceStatusPOST(req, res) {
	const proxyMachineStatus = await getProxyStatus(req.body.existingMachines);
	return res.status(200).json(proxyMachineStatus);
};

// Returns data about the current 24 hour period's projected tabroom usage.
export async function getTabroomUsage(req, res) {
// Moved function to a stub so that the auto api cron processes can
// also access it.  I know, I hate this sort of sixteen-nested-files
// thing, too.
	const usageData = await showTabroomUsage();
	return res.status(200).json(usageData);
};

// Show data about an individual machine; this is useful mostly in bringing up
// machines.
export async function getTabroomInstance(req, res) {
	const linodeData = await axios.get(
		`${config.linode.api_url}/instances/${req.params.linodeId}`,
		{
			headers : {
				Authorization  : `Bearer ${config.linode.api_token}`,
				'Content-Type' : 'application/json',
				Accept         : 'application/json',
			},
		},
	);

	if (req.returnToSender) {
		return linodeData.data;
	}

	return res.status(200).json(linodeData.data);
};

// Simple counter of how many servers are currently running to display in the
// header of cloud service administrators.
export async function getTabroomInstanceCounts(req, res) {
	const { rows: tabwebCount } = await sql`
		select
			count(distinct id) as count
		from server
			where 1=1
			and hostname like 'tabweb%'
			and status = 'running'
	`.execute(kdb);

	if (tabwebCount && tabwebCount.length > 0) {
		return res.status(200).json({ ...tabwebCount[0] });
	}
};

// who to credit in server messages, which read "<name> <email> has ...".
// while su'd: "Admin Name admin@email while su'd as Person Name person@email"
const whoDunnit = (req) => {
	const { person } = req;
	const su = req.auth.su;
	return {
		name: su
			? `${su.first} ${su.last} ${su.email} while su'd as ${person.first} ${person.last}`
			: `${person.first} ${person.last}`,
		email: person.email,
	};
};

// API facing functions that will bring up or destroy machines.
export async function changeInstanceCount(req, res) {
	const who = whoDunnit(req);
	const user = {
		su    : req.session.su,
		id    : req.session.person,
		name  : who.name,
		email : who.email,
	};

	const serverCount = parseInt(req.params.target) || parseInt(req.body.target) || 0;
	if (req.method === 'POST') {
		const response = await increaseLinodeCount(user, serverCount);
		return res.status(200).json(response);
	} else if (req.method === 'DELETE') {
		const response = await decreaseLinodeCount(user, serverCount);
		return res.status(200).json(response);
	}
};

export async function rebootInstance(req, res) {
	req.returnToSender = true;
	const machine = await getTabroomInstance.GET(req, res);

	if (!machine
		|| (
			!machine?.tags?.includes(config.linode.webhost_base)
			&& !machine?.tags?.includes('tab-admin')
		)
	) {
		return res.status(200).json({
			message: `Only active tabweb instances can be rebooted with this interface.  Please try again with another host.`,
		});
	}

	const who = whoDunnit(req);
	const resultMessages = [
		`${who.name} ${who.email} has REBOOTED ${machine}:\n`,
		'\n',
	];

	try {

		const rebootReply = await axios.post(
			`${config.linode.api_url}/instances/${machine.id}/reboot`,
			{},
			{
				headers : {
					Authorization  : `Bearer ${config.linode.api_token}`,
					'Content-Type' : 'application/json',
					Accept         : 'application/json',
				},
			},
		);

		if (parseInt(rebootReply.status) === 200) {
			resultMessages.push(`Machine ${machine.label} reboot request successful. This operation will take a few minutes.`);
		}

	} catch (err) {

		logger.error(err.response.data);

		return res.status(200).json({
			message: `Deleting ${machine.label} failed with response code ${err.response.status} ${err.response.statusText} and errors ${err.response?.data?.errors}`,
		});
	}

	await changeLogRepo.createChangeLog(kdb, {
		person     : req.session.su || req.session.person,
		tag        : 'sitewide',
		created_at : new Date(),
		description: resultMessages.join('\n'),
	});

	await notifyCloudAdmins(req, resultMessages.join('<br />'), `${machine.label} Rebooted`);

	return res.status(200).json({
		message: resultMessages.join('<br />'),
	});
};

const notifyCloudAdmins = async (req, log, subject) => {

	const { rows: cloudAdmins } = await sql`
		select distinct person.id
			from person, person_setting ps
		where person.id = ps.person
			and ps.tag = ${'system_administrator'}
	`.execute(kdb);

	let sender = '';

	if (req.session.su) {
		sender = await summon(kdb, 'person',req.session.su);
	} else {
		sender = await summon(kdb, 'person',req.session.person);
	}

	const adminIds = cloudAdmins.map( item => item.id );

	const message = {
		ids     : adminIds,
		html    : log,
		from    : `${sender.first} ${sender.last} <${sender.email}>`,
		subject : `Tabroom Cloud Change: ${subject}`,
	};

	if (config.linode.notify_slack) {
		message.emailInclude = [config.linode.notify_slack];
	}

	const emailResponse = await notify(message);
	return emailResponse;
};