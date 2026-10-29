import { describe, it, expect } from "vitest";
import { validateNotificationRequest, NotificationRequestSchema } from "./notify.js";

describe("Request Validation", () => {
	it("should accept a well-formed request", async () => {
		const validInput = {
			ids: [1, 2, 3],
			text: "test message",
			subject: null,
			body: null,
			url: null,
			channels: { inbox: true },
		};
		expect(validateNotificationRequest(validInput)).toMatchSchema(NotificationRequestSchema);
	});
	it("should reject duplicate IDs", async () => {
		const invalidInput = {
			ids: [1, 1, 2],
			text: "test message",
			channels: { inbox: true },
		};
		expect(() => validateNotificationRequest(invalidInput)).toThrow();
	});
	it("should reject an empty ID array", async () => {
		const invalidInput = {
			ids: [],
			text: "test message",
			channels: { inbox: true },
		};
		expect(() => validateNotificationRequest(invalidInput)).toThrow();
	});
});
