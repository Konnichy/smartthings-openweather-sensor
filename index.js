const smartApp = require('./smartapp');

module.exports.handler = (event, context, callback) => {
    smartApp.handleLambdaCallback(event, context, callback);
};
