// This route will throw a dummy error to test whether the error reporting is
// working which is apparently pretty goddamned rare.

export async function throwTestError(req, res) {
	throw new Error(`I have been called to create an error and i have!`);
}
