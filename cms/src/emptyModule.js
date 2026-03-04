// Mock module for webpack admin bundle — replaces server-only imports
const noop = () => {};
const noopReturn = () => () => {};
module.exports = {};
module.exports.default = noop;
module.exports.s3Adapter = noopReturn;
module.exports.cloudStorage = noopReturn;
module.exports.authenticateJWT = noop;
module.exports.lexicalEditor = noopReturn;
