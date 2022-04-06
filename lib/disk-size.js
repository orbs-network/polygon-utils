const inquirer = require('inquirer')
const chalk = require('chalk')
const Utils = require('./tooling/utils')

const {exec} = require('./tooling/exec')

let awsProfile


module.exports = {

    async start({profile}) {

        awsProfile = profile

        const instances = await _getAwsInstances()

        if (Object.keys(instances).length === 0) {
            console.log(chalk.green('No EFS file systems found'))
            return
        }

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

            const instance = answers.instance

            const volumes = await _getInstanceVolumes(
                instance.id
            )

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
                },
                {
                    type: 'input',
                    name: 'sizeGB',
                    message: `Select size of disk in GB`
                },
                {
                    type: 'input',
                    name: 'sshKeyPath',
                    message: `Enter the path to the ssh key`
                }
            ]).then(async answers => {

                inquirer.prompt([{
                    type: 'confirm',
                    name: 'performResize',
                    message: `This will change Volume [${answers.volume.id}] on instance [${instance.id}] from size [${answers.volume.size}] to size [${answers.sizeGB}]. Continue?`
                }]).then(async answers => {

                    if (answers.performResize) {

                        await _performDiskSizeChange(
                            instance,
                            answers.volume.id,
                            answers.sizeGB
                        )

                        const sshKeyPath = answers.sshKeyPath

                        const lsblkResult = await exec(`sudo ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no ubuntu@${instance.ipAddress} "lsblk"`);

                        console.log(chalk.whiteBright('current volumes mounted on the instance:'))
                        console.log(chalk.white(lsblkResult.stdout))

                        inquirer.prompt([{
                            type: 'confirm',
                            name: 'autoResizePartition',
                            message: 'Attempt automatic resize of partition and file system?'
                        }]).then(async answers => {

                            if (answers.autoResizePartition) {

                                await _resizePartition(
                                    instance,
                                    sshKeyPath
                                )

                            } else {

                                console.log(chalk.yellowBright('Please make sure to manually resize the partition and file system!'))

                            }

                        })

                    }

                })

            })

        })

    }

}

async function _getAwsInstances() {

    const resultJson = Utils.parseExecResult(
        await exec(`aws ec2 describe-instances --profile ${awsProfile}`)
    )

    const instances = []

    for (const reservation of resultJson.Reservations) {

        for (const instance of reservation.Instances) {

            if (instance.Tags) {

                instances.push({
                    name: instance.Tags.find(tag => tag.Key === 'Name').Value,
                    id: instance.InstanceId,
                    ipAddress: instance.PublicIpAddress
                })

            }

        }

    }


    return instances

}

async function _getInstanceVolumes(instanceId) {

    const resultJson = Utils.parseExecResult(
        await exec(`aws ec2 describe-volumes --profile ${awsProfile} --filters Name=attachment.instance-id,Values=${instanceId}`)
    )

    const volumes = []

    for (const volume of resultJson.Volumes) {

        volumes.push({
            size: volume.Size,
            id: volume.VolumeId,
            type: volume.VolumeType
        })

    }

    return volumes

}

async function _performDiskSizeChange(instance, volumeId, sizeGB, sshKeyPath) {

    let resultJson = Utils.parseExecResult(
        await exec(`aws ec2 modify-volume --profile ${awsProfile} --size ${sizeGB} --volume-id ${volumeId}`)
    )

    const volumeModification = resultJson.VolumeModification

    console.log(chalk.green(`Successfully changed the size of volume [${volumeModification.VolumeId}] size from ${volumeModification.OriginalSize}GB to ${volumeModification.TargetSize}GB!`))

    return volumeModification

}

async function _resizePartition(instance, sshKeyPath) {

    const partResizeResult = await exec(`sudo ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no ubuntu@${instance.ipAddress} "sudo growpart /dev/nvme0n1 1"`)

    _printSshExecResult(partResizeResult)

    const fsResizeResult = await exec(`sudo ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no ubuntu@${instance.ipAddress} "sudo resize2fs /dev/nvme0n1p1"`)

    _printSshExecResult(fsResizeResult)

    const dfResult = await exec(`sudo ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no ubuntu@${instance.ipAddress} "df -h"`)

    _printSshExecResult(dfResult)

    console.log(chalk.greenBright('Done! please confirm partitions and mounting sizes'))

}

function _printSshExecResult(result) {

    if (result.stdout) {
        console.log(chalk.green(result.stdout))
    } else {
        console.log(chalk.red(result.stderr))
    }

}
