const Utils = require("./Utils");
const {exec} = require("./exec");

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

    }
}
