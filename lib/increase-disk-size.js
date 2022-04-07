const inquirer = require('inquirer')
const chalk = require('chalk')
const Utils = require('./tooling/utils')
const AwsUtils = require('./tooling/aws-utils')
const {exec} = require('./tooling/exec')
const fs = require('fs')

const ORIGINAL_SIZE_GB = 8
const REQUESTED_SIZE_GB = 16

let awsProfile

/**
 * Util to increase EBS size from 8GB to 16GB on aws and updates the linux Partition and FileSystem
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

                await _flow_selectVolume(
                    answers.instance
                );

            })

        } else {

            await _flow_selectVolume(
                instances[0]
            )

        }

    }

}

/**
 *
 * @param instance
 * @param volume
 * @param pathToSSHKey
 * @private
 */
function _flow_confirmVolumeSizeChangeParameters(instance, volume, pathToSSHKey) {


    inquirer.prompt([{
        type: 'confirm',
        name: 'performResize',
        message: `This will change Volume [${volume.id}] on instance [${instance.id}] from size [${volume.size}] to size [${REQUESTED_SIZE_GB}]. Continue?`
    }]).then(async answers => {

        if (answers.performResize) {

            await _performDiskSizeChange(
                instance,
                volume.id
            )

            const lsblkResult = await exec(`sudo ssh -i ${pathToSSHKey} -o StrictHostKeyChecking=no ubuntu@${instance.ipAddress} "lsblk"`);

            console.log(chalk.whiteBright('current volumes mounted on the instance:'))

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                'lsblk',
                null,
                true
            )

            console.log(chalk.whiteBright('Attempting automatic resize of partition and file system'))

            await _flow_resizePartition(
                instance,
                pathToSSHKey
            )

        }

    })

}

/**
 *
 * @param instance
 * @param volume
 * @private
 */
function _flow_selectSshKey(instance, volume) {

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

            _flow_confirmVolumeSizeChangeParameters(
                instance,
                volume,
                answers.pathToSSHKey
            )

        })

    } else {

        _flow_confirmVolumeSizeChangeParameters(
            instance,
            volume,
            pathToSSHKey
        )

    }


}

/**
 *
 * @param instance
 * @returns {Promise<void>}
 * @private
 */
async function _flow_selectVolume(instance) {

    const volumes = await AwsUtils.getInstanceVolumes(
        awsProfile,
        instance.id
    )

    if (volumes.length === 0) {

        throw new Error(chalk.redBright('No volumes found! cannot continue'))

    }

    const _relevantVolumes = volumes.filter(volume => volume.size === ORIGINAL_SIZE_GB)

    if (_relevantVolumes.length === 0) {

        throw new Error(chalk.redBright('No volumes with size 8GB were found! cannot continue'))

    } else if (_relevantVolumes.length > 1) {

        console.warn(chalk.yellowBright('More than 1 volumes with size 8GB were found, please select the desired one from the list'))

        inquirer.prompt([
            {
                type: 'list',
                name: 'volume',
                message: 'Select Volume to modify',
                choices: volumes.map(volume => {
                    return {
                        name: `${volume.id} (type:${volume.type}, size:${volume.size})`,
                        value: volume
                    }
                }),
            }
        ]).then(async answers => {

            _flow_selectSshKey(
                instance,
                answers.volume
            )

        })

    } else {

        _flow_selectSshKey(
            instance,
            _relevantVolumes[0]
        )

    }
}

/**
 *
 * @param instance
 * @param volumeId
 * @returns {Promise<*>}
 * @private
 */
async function _performDiskSizeChange(instance, volumeId) {

    let resultJson = Utils.parseExecResult(
        await exec(`aws ec2 modify-volume --profile ${awsProfile} --size ${REQUESTED_SIZE_GB} --volume-id ${volumeId}`)
    )

    const volumeModification = resultJson.VolumeModification

    console.log(chalk.green(`Successfully changed the size of volume [${volumeModification.VolumeId}] size from ${volumeModification.OriginalSize}GB to ${volumeModification.TargetSize}GB!`))

    return volumeModification

}

/**
 *
 * @param instance
 * @param pathToSSHKey
 * @returns {Promise<void>}
 * @private
 */
async function _flow_resizePartition(instance, pathToSSHKey) {

    await Utils.execRemoteCommand(
        pathToSSHKey,
        instance.ipAddress,
        'sudo growpart /dev/nvme0n1 1'
    )

    await Utils.execRemoteCommand(
        pathToSSHKey,
        instance.ipAddress,
        'sudo resize2fs /dev/nvme0n1p1'
    )

    await Utils.execRemoteCommand(
        pathToSSHKey,
        instance.ipAddress,
        'df -h',
        null,
        true
    )

    console.log(chalk.greenBright('Done! please confirm partitions and mounting sizes'))

}

