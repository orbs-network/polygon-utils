const chalk = require("chalk");

module.exports = {

    parseExecResult(result) {

        try {

            return JSON.parse(result.stdout);

        } catch (e) {
            console.log(chalk.redBright(`error! ${result.stderr}`))
            throw e
        }

    }

}
