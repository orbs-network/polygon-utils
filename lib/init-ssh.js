const inquirer = require('inquirer')
const chalk = require('chalk')
const fs = require('fs')
const {exec} = require("./tooling/exec")
const AWSUtils = require("./tooling/AWSUtils")
const Utils = require("./tooling/Utils");

const PATH_TO_CURRENT_SSH_KEY = process.env.HOME + '/.ssh/id_rsa'
const PATH_TO_NEW_SSH_KEY = process.env.HOME + `/.ssh/orbs_rsa`
const TEMP_USER_DATA__ORIGINAL_FILENAME = 'temp_user_data__original'
const TEMP_USER_DATA__W_SSH_KEY_FILENAME = 'temp_user_data__w_ssh_key'

let awsProfile

/**
 *
 */
module.exports = {

    /**
     *
     * @param profile
     * @param instance
     * @param logger
     * @returns {Promise<boolean|*>}
     */
    async flow_start(profile, instance, logger) {

        try {

            awsProfile = profile

            // trying to use a previously generated ssh key (by this tool)
            let pathToSSHKey = PATH_TO_NEW_SSH_KEY

            // fallback to the original generated ssh key (by polygon)
            if (!fs.existsSync(pathToSSHKey)) {
                pathToSSHKey = PATH_TO_CURRENT_SSH_KEY
            }

            if (!fs.existsSync(pathToSSHKey)) {

                console.warn(chalk.yellowBright('SSH Key "id_rsa" or "orbs_rsa" not found in "~/.ssh/" - please input the path to the SSH key file'))

                const answers = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'pathToSSHKey',
                        message: `Enter the path to the ssh key, or leave empty to generate a new ssh key (this should only be selected if cannot retrieve the current key!)`
                    }
                ])

                if (answers.pathToSSHKey) {

                    return trySSH(
                        instance,
                        answers.pathToSSHKey
                    )

                } else {

                    return generateNewSSHKey(
                        instance,
                        answers.pathToSSHKey
                    )

                }

            } else {

                return trySSH(
                    instance,
                    pathToSSHKey
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
 * @param pathToSSHKey
 * @param generateIfFail
 * @returns {Promise<boolean|*>}
 */
async function trySSH(instance, pathToSSHKey, generateIfFail = true) {

    console.log(chalk.white(`attempting to connect to instance [${instance.name}] using ssh key in: ${pathToSSHKey}`))

    let result = await exec(`ssh -o StrictHostKeyChecking=no -i ${pathToSSHKey} ubuntu@${instance.ipAddress} "echo test-ssh"`)

    if (result.stderr && result.stderr.indexOf('Permission denied (publickey)') >= 0) {

        if (generateIfFail) {

            console.warn(chalk.red(`failed to ssh connect to instance [${instance.name}]`))

            return generateNewSSHKey(
                instance
            )

        } else {

            return false

        }


    } else if (result.stderr && result.stderr.indexOf('Operation timed out') >= 0) {

        console.log(chalk.yellow('Instance is stopped, attempting to start instance...'))

        await AWSUtils.startInstance(
            awsProfile,
            instance.id
        )

        return trySSH(
            instance,
            pathToSSHKey,
            generateIfFail
        )


    } else {

        console.log(chalk.green(`ssh connect to instance [${instance.name}] successful!`))

        return pathToSSHKey

    }

}

/**
 *
 * @param instance
 * @returns {Promise<boolean>}
 */
async function generateNewSSHKey(instance) {

    console.warn(chalk.yellow(`attempting to generate a new ssh key and upload it to instance [${instance.name}]`))

    console.log(chalk.white(`Stopping instance [${instance.name}]`))

    await AWSUtils.stopInstance(
        awsProfile,
        instance.id
    )

    console.log(chalk.white(`saving current instance [${instance.name}] user-data`))

    await AWSUtils.saveUserDataToFile(
        awsProfile,
        instance.id,
        TEMP_USER_DATA__ORIGINAL_FILENAME
    )

    console.log(chalk.white(`generating new ssh key`))

    await exec(`ssh-keygen -t rsa -C "" -N "" -m PEM -f ${PATH_TO_NEW_SSH_KEY} <<<y >/dev/null 2>&1`)

    const sshPkPath = PATH_TO_NEW_SSH_KEY + '.pub'

    if (fs.existsSync(sshPkPath)) {

        const sshPK = fs.readFileSync(sshPkPath).toString()

        console.log(chalk.green('new ssh public key is: \n' + sshPK))

        const content = "#cloud-config\n" +
            "cloud_final_modules:\n" +
            "- [users-groups, always]\n" +
            "users:\n" +
            "  - name: ubuntu\n" +
            "    ssh-authorized-keys:\n" +
            `    - ${sshPK}`

        await fs.writeFileSync(TEMP_USER_DATA__W_SSH_KEY_FILENAME, content, err => {
            if (err) {
                console.error(err)
            }
        })

        const tempUserDataSSHKeyFilenameBase64 = TEMP_USER_DATA__W_SSH_KEY_FILENAME + '__base64'

        console.log(chalk.white(`converting user-data file to base64`))

        await exec(`base64 ./${TEMP_USER_DATA__W_SSH_KEY_FILENAME} >./${tempUserDataSSHKeyFilenameBase64}`)

        console.log(chalk.white(`uploading new user-data to instance [${instance.name}]`))

        await AWSUtils.uploadUserDataToInstance(
            awsProfile,
            instance.id,
            tempUserDataSSHKeyFilenameBase64
        )

        console.log(chalk.white(`starting instance [${instance.name}] to import the new ssh key`))

        await AWSUtils.startInstance(
            awsProfile,
            instance.id
        )

        const finalSSHKeyPath = await Utils.execWithRetry(
            async () => trySSH(
                instance,
                PATH_TO_NEW_SSH_KEY,
                false
            ),
            result => result,
            'failed connecting (scripts might still be running)'
        )

        if (finalSSHKeyPath) {

            console.log(chalk.white(`Stopping instance [${instance.name}] to restore original user-data`))

            await AWSUtils.stopInstance(
                awsProfile,
                instance.id
            )

            console.log(chalk.white(`converting original user-data file to base64`))

            const tempUserDataOriginalFilenameBase64 = TEMP_USER_DATA__ORIGINAL_FILENAME + '__base64'

            await exec(`base64 ./${TEMP_USER_DATA__ORIGINAL_FILENAME} >./${tempUserDataOriginalFilenameBase64}`)

            console.log(chalk.white(`restoring original user-data to instance [${instance.name}]`))

            await AWSUtils.uploadUserDataToInstance(
                awsProfile,
                instance.id,
                tempUserDataOriginalFilenameBase64
            )

            console.log(chalk.white(`starting instance [${instance.name}]`))

            await AWSUtils.startInstance(
                awsProfile,
                instance.id
            )

            return finalSSHKeyPath

        } else {

            throw new Error('failed connecting to instance to may times, aborting')

        }

    } else {

        throw new Error('cant generate a new local ssh key! aborting')

    }


}
