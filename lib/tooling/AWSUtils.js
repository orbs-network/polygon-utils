const Utils = require("./Utils");
const {exec} = require("./exec");
const chalk = require("chalk");

module.exports = {

    /**
     * get aws instances for a profile
     *
     * @param awsProfile
     * @returns {Promise<*[]>}
     */
    async getAwsInstances(awsProfile) {

        const resultJson = Utils.parseAwsExecResult(
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

    },

    /**
     * get volumes attached to an instance
     *
     * @param awsProfile
     * @param instanceId
     * @returns {Promise<*[]>}
     */
    async getInstanceVolumes(awsProfile, instanceId) {

        const resultJson = Utils.parseAwsExecResult(
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

    },

    /**
     *
     * @param awsProfile
     * @param instanceId
     * @returns {Promise<boolean>}
     */
    async stopInstance(awsProfile, instanceId) {

        let resultJson = await Utils.execWithRetry(
            async () => Utils.parseAwsExecResult(
                await exec(`aws ec2 stop-instances  --profile ${awsProfile} --instance-ids ${instanceId}`)
            ),
            result => result.StoppingInstances[0].CurrentState.Code === 80, // stopped
            'instance still running'
        )

        if (resultJson) {

            return resultJson

        } else {

            throw new Error('Cannot stop instance! make sure you are using the correct aws profile. If so, you can manually stop the instance on aws console and try again.')

        }

    },

    /**
     *
     * @param awsProfile
     * @param instanceId
     * @returns {Promise<boolean>}
     */
    async startInstance(awsProfile, instanceId) {

        let resultJson = await Utils.execWithRetry(
            async () => Utils.parseAwsExecResult(
                await exec(`aws ec2 start-instances  --profile ${awsProfile} --instance-ids ${instanceId}`)
            ),
            result => result.StartingInstances[0].CurrentState.Code === 16, // running
            'instance still starting',
            60
        )

        if (resultJson) {

            console.warn(chalk.green(`instance is running`))
            return resultJson

        } else {

            throw new Error('Cannot start instance! make sure you are using the correct aws profile. If so, you can manually start the instance on aws console and try again.')

        }

    },

    /**
     *
     * @param awsProfile
     * @param instanceId
     * @param filename
     * @returns {Promise<boolean>}
     */
    async saveUserDataToFile(awsProfile, instanceId, filename) {

        await exec(`aws ec2 describe-instance-attribute  --profile ${awsProfile}  --instance-id ${instanceId} --attribute userData --output text --query "UserData.Value" | base64 --decode >${filename}`)

    },

    /**
     *
     * @param awsProfile
     * @param instanceId
     * @param filename
     * @returns {Promise<void>}
     */
    async uploadUserDataToInstance(awsProfile, instanceId, filename) {

        await exec(` aws ec2 modify-instance-attribute  --profile ${awsProfile} --instance-id ${instanceId} --attribute userData --value file://${filename}`);

    }

}
