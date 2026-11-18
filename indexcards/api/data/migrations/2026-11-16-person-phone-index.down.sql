-- Reverts 2026-11-16-person-phone-index.sql: phone lookups go back to scanning person.
ALTER TABLE person
	DROP INDEX person_phone,
	ALGORITHM=INPLACE, LOCK=NONE;
