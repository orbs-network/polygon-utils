const chalk = require("chalk")
const {exec} = require("./exec")

module.exports = {

    /**
     *
     * @param result
     * @returns {any}
     */
    parseAwsExecResult(result) {

        try {

            return JSON.parse(result.stdout)

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
     * @param logger
     * @param commandFilename
     * @param isInfo
     * @returns {Promise<void>}
     */
    async execRemoteCommand(pathToSSHKey, ipAddress, command, logger, commandFilename = null, isInfo = false) {

        if (commandFilename) {

            console.log(chalk.white(`executing remote command using file [${commandFilename}]`))

            this.printSshExecResult(
                commandFilename,
                ipAddress,
                await exec(`ssh -i ${pathToSSHKey} ubuntu@${ipAddress} "bash -s" < ${commandFilename}`),
                isInfo,
                logger
            )

        } else {

            console.log(chalk.white(`executing remote command [${command}]`))

            this.printSshExecResult(
                command,
                ipAddress,
                await exec(`ssh -i ${pathToSSHKey} ubuntu@${ipAddress} "${command}"`),
                isInfo,
                logger
            )

        }

    },

    /**
     *
     * @param command
     * @param ipAddress
     * @param result
     * @param isInfo
     * @param logger
     */
    printSshExecResult(command, ipAddress, result, isInfo, logger) {

        if (result.exitCode === 0 && !result.stderr) {

            const successMessage = result.stdout || 'Done'

            logger.log(
                `execution result of remote command [${command}]`,
                {ipAddress: ipAddress, success: successMessage}
            )

            console.log(isInfo ? chalk.white(successMessage) : chalk.green(successMessage))

        } else {

            const errorMessage = result.stderr || result

            logger.error(
                `execution error of remote command [${command}]`,
                errorMessage,
                {ipAddress: ipAddress, error: errorMessage}
            )

            console.error(chalk.red(errorMessage))

        }

    }

}
