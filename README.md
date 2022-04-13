# polygon-utils
This includes actions and utils to help maintain existing orbs-nodes.

### - Modify EBS (os) disk size
Util to increase EBS size from 8GB to 16GB on aws and updates the linux Partition and FileSystem (without downtime)

```polygon-utils increase-disk-size```

This will:
1. Change the disk size on aws from 8GB to 16GB
2. Grow the partition of the disk to the correct new size
3. Extend the file system to work with the full disk size
* tip - you can pass `--profile` to select a different aws profile to use (default is "default")

### - Clean-up unnecessary files
Util to clean up unnecessary files from the os by executing several shell commands

```polygon-utils clean-disk```

This will:
1. Clean journals
2. Clean snaps
3. Clean apt-get
4. Purge snapd


* tip - you can pass `--profile` to select a different aws profile to use (default is "default")


