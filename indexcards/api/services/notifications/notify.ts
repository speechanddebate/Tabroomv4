import { sendInboxNotification } from "./channels/inbox.js";
import { sendEmailNotification } from "./channels/email.js";
import { sendWebPushNotification } from "./channels/webpush.js";
export type inputData = {
	ids     : number[] // Array of recipient ID accounts.
	text    : string // Text of the message to send
	subject? : string // Subject line of the emails/blasts.  Optional.
	url?     : string // URL appended to the email or where the click-through of
			  // notification lands.  Optional.
	append?  : string // Text appended to the message as a footer. Optional.
	noWeb?   : boolean  // Optional.  If true , no web pushes sent , only email
	noEmail? : boolean  // Optional.  If true , no email sent, only web pushes
	noInbox? : boolean  // Optional.  If true , no message created in Tabroom inbox
	html?          : string
	sender?        : number
	from?          : string
	replyTo?       : string
	emailId?       : number
	tourn?         : number
	email?         : string[]
	ignoreNoEmail? : boolean
}

export type notifyResponse = {
	error   : boolean
	message : string
	email   : number
	inbox   : number
	web     : number
	errors? : unknown[]
}

export async function notify(inputData: inputData): Promise<notifyResponse> {
	// dedupe recipient IDs
	inputData.ids = inputData.ids.filter((value, index, array) => array.indexOf(value) === index);

	//validate input data
	if(inputData.ids.length < 1 || (!inputData.text && !inputData.html)) {
		return {
			error   : false,
			message : `No recipients or message sent for notifications`,
			email   : 0,
			inbox   : 0,
			web     : 0,
		};
	}

	let promises: Promise<notifyResponse>[] = [];
	if(!inputData.noInbox) {
		promises.push(sendInboxNotification(inputData));
	}

	if(!inputData.noEmail) {
		promises.push(sendEmailNotification(inputData));
	}

	if(!inputData.noWeb) {
		promises.push(sendWebPushNotification(inputData));
	}
	if(promises.length === 0) {
		return {
			error   : false,
			message : `No notifications sent due to user preferences`,
			email   : 0,
			inbox   : 0,
			web     : 0,
		};
	}
	
	const responses = await Promise.all(promises);

	// Aggregate responses
	let finalResponse: notifyResponse = {
		error   : false,
		message : `Notifications sent`,
		email   : 0,
		inbox   : 0,
		web     : 0,
	};
	for(const response of responses) {
		finalResponse.error   ||= response.error;
		finalResponse.email   += response.email;
		finalResponse.inbox   += response.inbox;
		finalResponse.web     += response.web;
	}
	finalResponse.message = `${finalResponse.inbox} Tabroom inbox messages delivered.`;
	return finalResponse;
}