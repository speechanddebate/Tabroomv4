import config from '../config.js';

export const getSalesforceStudents = async (naudlChapter: string) => {
	const authData = await authSalesforce();
	const queryBase = `${authData.instance_url}/services/data/v59.0/query`;
	const queryText = `?q=SELECT+Id,Tabroom_ID__c,School__c+FROM+Student__c+WHERE+School__c=+'${naudlChapter}'`;

	const getResponse = await fetch(
		`${queryBase}${queryText}`,
		{
			headers : {
				Authorization  : `OAuth ${authData.access_token}`,
				'Content-Type' : 'application/json',
				Accept         : 'application/json',
			},
		}
	);

	if (!getResponse.ok) {
		throw new Error(`Salesforce ${getResponse.status} ${getResponse.statusText}`);
	}

	return (await getResponse.json())?.records;
};

export const getOneSalesforceStudent = async (studentId: string) => {
	const authData = await authSalesforce();
	const queryBase = `${authData.instance_url}/services/data/v59.0/query`;
	const queryText = `?q=SELECT+Id,Tabroom_ID__c,School__c+FROM+Student__c+WHERE+Tabroom_ID__c=+'${studentId}'`;

	const getResponse = await fetch(
		`${queryBase}${queryText}`,
		{
			headers : {
				Authorization  : `OAuth ${authData.access_token}`,
				'Content-Type' : 'application/json',
				Accept         : 'application/json',
			},
		}
	);

	if (!getResponse.ok) {
		throw new Error(`Salesforce ${getResponse.status} ${getResponse.statusText}`);
	}

	return (await getResponse.json())?.records[0];
};

export const getAllSalesforceStudents = async () => {
	const authData = await authSalesforce();
	const queryBase = `${authData.instance_url}/services/data/v59.0/query`;
	const queryText = `?q=SELECT+Id,Tabroom_ID__c,School__c+FROM+Student__c+WHERE+Tabroom_ID__c!=null`;

	const getResponse = await fetch(
		`${queryBase}${queryText}`,
		{
			headers : {
				Authorization  : `OAuth ${authData.access_token}`,
				'Content-Type' : 'application/json',
				Accept         : 'application/json',
			},
		}
	);

	if (!getResponse.ok) {
		throw new Error(`Salesforce ${getResponse.status} ${getResponse.statusText}`);
	}

	return (await getResponse.json())?.records;
};

export const postSalesforceStudents = async (body: Record<string, object>) => {

	const authData = await authSalesforce();
	if (authData) {
		const postResponse = await fetch(
			`${authData.instance_url}${config.naudl.student_endpoint}`,
			{
				method  : 'POST',
				headers : {
					Authorization  : `OAuth ${authData.access_token}`,
					'Content-Type' : 'application/json',
					Accept         : 'application/json',
				},
				body : JSON.stringify(body),
			}
		);

		if (!postResponse.ok) {
			throw new Error(`Salesforce ${postResponse.status} ${postResponse.statusText}`);
		}

		return await postResponse.json();
	}

	return 'Authentication Failure';
};

export const getSalesforceChapters = async () => {

	const authData = await authSalesforce();
	const queryBase = `${authData.instance_url}/services/data/v59.0/query`;
	const queryText = `?q=SELECT+Id,Tabroom_teamid__c,IsDeleted+FROM+School__c+WHERE+Tabroom_teamid__c!=null`;

	const getResponse = await fetch(
		`${queryBase}${queryText}`,
		{
			headers : {
				Authorization  : `OAuth ${authData.access_token}`,
				'Content-Type' : 'application/json',
				Accept         : 'application/json',
			},
		}
	);

	if (!getResponse.ok) {
		throw new Error(`Salesforce ${getResponse.status} ${getResponse.statusText}`);
	}

	return (await getResponse.json())?.records;
};

const authSalesforce = async () => {

	const naudl = config.naudl;

	if (!naudl.client_id || !naudl.client_secret || !naudl.username || !naudl.pw) {
		return false;
	}

	const authResponse = await fetch(
		'https://login.salesforce.com/services/oauth2/token',
		{
			method : 'POST',
			body   : new URLSearchParams({
				grant_type    : 'password',
				client_id     : naudl.client_id,
				client_secret : naudl.client_secret,
				username      : naudl.username,
				password      : naudl.pw,
			}),
		},
	);

	if (!authResponse.ok) {
		throw new Error(`Salesforce auth ${authResponse.status} ${authResponse.statusText}`);
	}

	return (await authResponse.json()) || false;
};

export default authSalesforce;
