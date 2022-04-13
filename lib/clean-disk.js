const inquirer = require('inquirer')
const chalk = require('chalk')
const Utils = require('./tooling/Utils')
const fs = require('fs')
const AWSUtils = require("./tooling/AWSUtils")
const logger = new (require('./tooling/Logger'))('clean-disk')

let awsProfile

/**
 * Util to lean up unnecessary files from the os by executing several shell commands
 *
 * @type {{flow_start({profile: *}): Promise<void>}}
 */
module.exports = {

    /**
     *
     * @param profile
     * @returns {Promise<void>}
     */
    async flow_start({profile}) {

        try {

            awsProfile = profile

            logger.log('Start flow', {awsProfile})

            const instances = await AWSUtils.getAwsInstances(
                awsProfile
            )

            if (instances.length === 0) {

                throw new Error(chalk.redBright('No instances found! cannot continue'))

            } else if (instances.length > 1) {

                logger.log('instances', {instances})

                console.warn(chalk.yellowBright(`More than 1 instance found on this profile (default), please select the desired one from the list (hint: you can set the profile with --profile arg)`))

                const answers = await inquirer.prompt([{
                    type: 'list',
                    name: 'instance',
                    message: 'Select Instance',
                    choices: instances.map(instance => {
                        return {
                            name: `${instance.name} (${instance.id})`,
                            value: instance
                        }
                    }),
                }])

                await _flow_selectSshKey(
                    answers.instance
                )

            } else {

                await _flow_selectSshKey(
                    instances[0]
                )

            }

        } catch (err) {

            logger.error(err.message, err)
            console.error(chalk.redBright(err))

        }

    }

}


/**
 *
 * @param instance
 * @private
 */
async function _flow_selectSshKey(instance) {

    logger.log('selected instance', {ipAddress: instance.ipAddress, instance})

    const pathToSSHKey = '~/.ssh/id_rsa.pub'

    if (!fs.existsSync(pathToSSHKey)) {

        console.warn(chalk.yellowBright('SSH Key "id_rsa.pub" not found in "~/.ssh/" - please input the path to the SSH key file'))

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'pathToSSHKey',
                message: `Enter the path to the ssh key`
            }
        ])

        await _flow_confirmCleanDisk(
            instance,
            answers.pathToSSHKey
        )

    } else {

        await _flow_confirmCleanDisk(
            instance,
            pathToSSHKey
        )

    }

}

/**
 *
 * @param instance
 * @param pathToSSHKey
 * @returns {Promise<void>}
 * @private
 */
async function _flow_confirmCleanDisk(instance, pathToSSHKey) {

    const answers = await inquirer.prompt([{
        type: 'confirm',
        name: 'performResize',
        message: `This will execute several shell commands to clean up unnecessary files on the instance [${instance.id} - ${instance.ipAddress}]. Continue?`
    }])

    if (answers.performResize) {

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            'df -h',
            logger,
            null,
            true
        )

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            'sudo journalctl --vacuum-size=200M',
            logger
        )

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            null,
            logger,
            './lib/shell-scripts/clean-snaps.sh'
        )

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            'sudo apt-get clean',
            logger
        )

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            'sudo apt-get autoclean',
            logger
        )

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            'sudo apt-get autoremove -y',
            logger
        )

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            'sudo apt-get purge snapd -y',
            logger
        )

        await Utils.execRemoteCommand(
            pathToSSHKey,
            instance.ipAddress,
            'df -h',
            logger,
            null,
            true
        )

        logger.log('Done!', {ipAddress: instance.ipAddress, instance})
        console.log(chalk.greenBright('clean-disk -> Done!'))

    }

}
