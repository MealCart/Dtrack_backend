// Fail closed for any outdated caller. This module has no network dependencies.
module.exports = new Proxy({}, { get() { return async () => { const error = new Error('External integration has been retired; use the Mealcart database'); error.status = 410; throw error; }; } });
