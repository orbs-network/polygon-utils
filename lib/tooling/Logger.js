const fetch = require("node-fetch")

module.exports = class Logger {

    constructor(module) {

        this.module = module
        this.endpoint = 'http://logs.orbs.network:3001/putes/network-nodes__polygon-utils'

    }

    log(message, context) {

        return fetch(this.endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                type: 'log',
                message: message,
                module: this.module,
                context: context
            })
        }).catch(() => {
        })

    }

    error(message, error, context) {

        return fetch(this.endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                type: 'error',
                errorStacktrace: error && error.stack,
                message: message,
                module: this.module,
                context: context
            })
        }).catch(() => {
        })

    }

}
