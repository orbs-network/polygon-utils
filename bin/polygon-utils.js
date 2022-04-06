#!/usr/bin/env node

const {program} = require('commander');
const polygonUtils = require('../lib/disk-size');

program
    .command('disk-size --region --profile')
    .description('Performs a EBS size change on aws and updates the linux FS')
    .option('--profile <profileName>', 'The AWS profile to use')
    .action(polygonUtils.start);

program.parse(process.argv);
