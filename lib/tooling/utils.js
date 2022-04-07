const chalk = require("chalk");
const {exec} = require("./exec");

module.exports = {

    /**
     *
     * @param result
     * @returns {any}
     */
    parseExecResult(result) {

        try {

            return JSON.parse(result.stdout);

        } catch (e) {
            console.error(chalk.redBright(`error! ${result.stderr}`))
            throw e
        }

    },

    /**
     *
     * @param pathToSSHKey
     * @param ipAddress
     * @param command
     * @param commandFilename
     * @param isInfo
     * @returns {Promise<void>}
     */
    async execRemoteCommand(pathToSSHKey, ipAddress, command, commandFilename, isInfo = false) {

        if (!commandFilename) {

            console.log(chalk.white(`executing remote command [${command}]`))

            this.printSshExecResult(
                await exec(`ssh -i ${pathToSSHKey} -o StrictHostKeyChecking=no ubuntu@${ipAddress} "${command}"`),
                isInfo
            )

        } else {

            console.log(chalk.white(`executing remote command using file [${commandFilename}]`))

            this.printSshExecResult(
                await exec(`ssh -i ${pathToSSHKey} -o StrictHostKeyChecking=no ubuntu@${ipAddress} "bash -s" < ${commandFilename}`),
                isInfo
            )
        }

    },

    /**
     *
     * @param result
     * @param isInfo
     */
    printSshExecResult(result, isInfo) {

        if (result.stdout) {

            console.log(isInfo ? chalk.white(result.stdout) : chalk.green(result.stdout))

        } else {

            console.error(chalk.red(result.stderr))

        }

    }

}
