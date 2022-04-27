const inquirer = require('inquirer')
const chalk = require('chalk')
const Utils = require('./tooling/Utils')
const AWSUtils = require('./tooling/AWSUtils')
const {exec} = require('./tooling/exec')
const logger = new (require('./tooling/Logger'))('increase-disk-size')
const InitSSH = require('./init-ssh')

const ORIGINAL_SIZE_GB = 8
const REQUESTED_SIZE_GB = 16

let awsProfile
let isAdvancedMode
let autoPartitionResize

/**
 *  Util to increase EBS size from 8GB to 16GB on aws and updates the linux Partition and FileSystem
 *
 * @type {{flow_start({profile: *, advancedMode: *, automaticPartitionResize: *}): Promise<void>}}
 */
module.exports = {

    /**
     *
     * @param profile
     * @param advancedMode
     * @param automaticPartitionResize
     * @returns {Promise<void>}
     */
    async flow_start({profile, advancedMode, automaticPartitionResize}) {

        try {

            awsProfile = profile
            isAdvancedMode = advancedMode
            autoPartitionResize = automaticPartitionResize

            logger.log('Start flow', {awsProfile})

            const instances = await AWSUtils.getAwsInstances(
                awsProfile
            )

            if (instances.length === 0) {

                throw new Error('No instances found! cannot continue')

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

                await _flow_selectVolume(
                    answers.instance
                );

            } else {

                await _flow_selectVolume(
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
 * @param volume
 * @param pathToSSHKey
 * @param skipAws
 * @returns {Promise<void>}
 * @private
 */
async function _flow_confirmVolumeSizeChangeParameters(instance, volume, pathToSSHKey, skipAws = false) {

    const answers = await inquirer.prompt([{
        type: 'confirm',
        name: 'performResize',
        message: skipAws ?
            `This will attempt automatic resize of partition and file system of [${volume.id}] on instance [${instance.id} - ${instance.ipAddress}]. Continue?` :
            `This will change Volume [${volume.id}] on instance [${instance.id} - ${instance.ipAddress}] from size [${volume.size}GB] to size [${REQUESTED_SIZE_GB}GB]. Continue?`
    }])

    if (answers.performResize) {

        if (!skipAws) {

            await _performDiskSizeChange(
                instance,
                volume
            )

        }

        if (autoPartitionResize) {

            console.log(chalk.whiteBright('current volumes mounted on the instance:'))

            await Utils.execRemoteCommand(
                pathToSSHKey,
                instance.ipAddress,
                'lsblk',
                logger,
                null,
                true
            )

            console.log(chalk.whiteBright('Attempting automatic resize of partition and file system'))

            await _flow_resizePartition(
                instance,
                pathToSSHKey
            )

        }

    }


}

/**
 *
 * @param instance
 * @param volume
 * @param skipAws
 * @returns {Promise<void>}
 * @private
 */
async function _flow_volumeSelected(instance, volume, skipAws = false) {

    logger.log('selected volume', {ipAddress: instance.ipAddress, volume})

    let pathToSSHKey

    if (autoPartitionResize) {

        pathToSSHKey = await InitSSH.flow_start(awsProfile, instance, logger)

    }

    await _flow_confirmVolumeSizeChangeParameters(
        instance,
        volume,
        pathToSSHKey,
        skipAws
    )

}

/**
 *
 * @param instance
 * @returns {Promise<void>}
 * @private
 */
async function _flow_selectVolume(instance) {

    logger.log('selected instance', {ipAddress: instance.ipAddress, instance})

    const volumes = await AWSUtils.getInstanceVolumes(
        awsProfile,
        instance.id
    )

    if (volumes.length === 0) {

        throw new Error('No volumes found! cannot continue')

    }

    logger.log('volumes', {ipAddress: instance.ipAddress, volumes})

    const originalSizedVolumes = volumes.filter(volume => volume.size === ORIGINAL_SIZE_GB)
    const alreadyModifiedVolumes = volumes.filter(volume => volume.size === REQUESTED_SIZE_GB)

    if (originalSizedVolumes.length === 0) {

        if (autoPartitionResize && alreadyModifiedVolumes.length > 0) {

            console.warn(chalk.yellowBright('No volumes with size 8GB were found!'))

            if (isAdvancedMode) {

                const choices = volumes.map(volume => {
                    return {
                        name: `${volume.id} (type:${volume.type}, size:${volume.size})`,
                        value: volume
                    }
                });

                choices.push(
                    {
                        name: `Quit?`,
                        value: '@@@quit@@@'
                    }
                )


                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'volume',
                        message: `Select a volume manually to try to automatic resize of partition and file system?\n(this is useful if the size was already modified earlier)`,
                        choices: choices,
                    }
                ])

                // should continue?
                if (answers.volume === '@@@quit@@@') {

                    process.exit(0)

                } else {

                    await _flow_volumeSelected(
                        instance,
                        answers.volume,
                        true
                    )

                }

            } else {

                console.warn(chalk.white('Auto selecting a volume with 16GB size (assuming the tool has already been executed before)'))

                await _flow_volumeSelected(
                    instance,
                    alreadyModifiedVolumes[0],
                    true
                )

            }

        } else {

            console.warn(chalk.whiteBright('Nothing to do, exiting'))
            process.exit(0)

        }


    } else if (originalSizedVolumes.length > 1) {

        logger.log('relevantVolumes', {ipAddress: instance.ipAddress, relevantVolumes: originalSizedVolumes})

        console.warn(chalk.yellowBright('More than 1 volumes with size 8GB were found, please select the desired one from the list'))

        const answers = await inquirer.prompt([
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
        ])

        await _flow_volumeSelected(
            instance,
            answers.volume
        )


    } else {

        await _flow_volumeSelected(
            instance,
            originalSizedVolumes[0]
        )

    }
}

/**
 *
 * @param instance
 * @param volume
 * @returns {Promise<*>}
 * @private
 */
async function _performDiskSizeChange(instance, volume) {

    logger.log('executing volume size change on aws', {ipAddress: instance.ipAddress, instance, volume})

    const resultJson = Utils.parseAwsExecResult(
        await exec(`aws ec2 modify-volume --profile ${awsProfile} --size ${REQUESTED_SIZE_GB} --volume-id ${volume.id}`)
    )

    const volumeModification = resultJson.VolumeModification

    logger.log('volume change on aws - successful', {ipAddress: instance.ipAddress, volumeModification})

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
        'df -h',
        logger,
        null,
        true
    )

    await Utils.execRemoteCommand(
        pathToSSHKey,
        instance.ipAddress,
        'sudo growpart /dev/nvme0n1 1',
        logger
    )

    await Utils.execRemoteCommand(
        pathToSSHKey,
        instance.ipAddress,
        'sudo resize2fs /dev/nvme0n1p1',
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
    console.log(chalk.greenBright('increase-disk-size -> Done!'))
    console.log(chalk.green('please confirm partitions and mounting sizes'))

}

