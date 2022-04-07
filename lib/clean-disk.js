const inquirer = require('inquirer')
const chalk = require('chalk')
const Utils = require('./tooling/utils')
const {exec} = require('./tooling/exec')
const fs = require('fs')
const AwsUtils = require("./tooling/aws-utils");

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


        awsProfile = profile

        const instances = await AwsUtils.getAwsInstances(
            awsProfile
        )

        if (instances.length === 0) {

            throw new Error(chalk.redBright('No instances found! cannot continue'))

        } else if (instances.length > 1) {

            console.warn(chalk.yellowBright(`More than 1 instance found on this profile (default), please select the desired one from the list (hint: you can set the profile with --profile arg)`))

            inquirer.prompt([{
                type: 'list',
                name: 'instance',
                message: 'Select Instance',
                choices: instances.map(instance => {
                    return {
                        name: `${instance.name} (${instance.id})`,
                        value: instance
                    }
                }),
            }]).then(async answers => {

                await _flow_selectSshKey(
                    answers.instance
                );

            })

        } else {

            await _flow_selectSshKey(
                instances[0]
            )

        }

    }

}


/**
 *
 * @param instance
 * @private
 */
function _flow_selectSshKey(instance) {

    const pathToSSHKey = '~/.ssh/id_rsa.pub'

    if (!fs.existsSync(pathToSSHKey)) {

        console.warn(chalk.yellowBright('SSH Key "id_rsa.pub" not found in "~/.ssh/" - please input the path to the SSH key file'))

        inquirer.prompt([
            {
                type: 'input',
                name: 'pathToSSHKey',
                message: `Enter the path to the ssh key`
            }
        ]).then(async answers => {

            _flow_confirmCleanDisk(
                instance,
                answers.pathToSSHKey
            )

        })

    } else {

        _flow_confirmCleanDisk(
            instance,
            pathToSSHKey
        )

    }

}

/**
 *
 * @param instance
 * @param volume
 * @param pathToSSHKey
 * @private
 */
async function _flow_confirmCleanDisk(instance, pathToSSHKey) {

    inquirer.prompt([{
        type: 'confirm',
        name: 'performResize',
        message: `This will execute several shell commands to clean up unnecessary files on the instance. Continue?`
    }]).then(async answers => {

        if (answers.performResize) {

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                'sudo journalctl --vacuum-size=200M'
            )

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                null,
                './lib/shell-scripts/clean-snaps.sh'
            )

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                'sudo apt-get clean'
            )

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                'sudo apt-get autoclean'
            )

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                'sudo apt-get autoremove'
            )

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                'sudo apt purge snapd -y'
            )

            console.log(chalk.greenBright('Done!'))

        }

    })

}
