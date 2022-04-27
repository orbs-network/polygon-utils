#!/usr/bin/env node

const {program} = require('commander');
const IncreaseDiskSize = require('../lib/increase-disk-size');
const CleanDisk = require('../lib/clean-disk');

program
    .command('increase-disk-size --profile --automatic-partition-resize')
    .description('Increase EBS size from 8GB to 16GB on aws and updates the linux Partition and FileSystem')
    .option('--profile <profileName>', 'The AWS profile to use (optional)', 'default')
    .option('--advanced-mode <advancedMode>', 'Run in advanced mode which prompt for more options', false)
    .option('--automatic-partition-resize <automaticPartitionResize>', 'Attempt to automaticly resize of partition and file system (this uses ssh to connect to the instance)', false)
    .action(IncreaseDiskSize.flow_start);

program
    .command('clean-disk --profile')
    .description('Executes several shell commands to clean unnecessary files from the os')
    .option('--profile <profileName>', 'The AWS profile to use (optional)', 'default')
    .action(CleanDisk.flow_start);

program.parse(process.argv);
