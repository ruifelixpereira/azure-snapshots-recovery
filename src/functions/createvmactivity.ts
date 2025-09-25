import * as df from 'durable-functions';
import { ActivityHandler } from 'durable-functions';
import { InvocationContext } from '@azure/functions';
import { CREATE_VM_ACTIVITY } from '../common/constants';
import { AzureLogger } from '../common/logger';
import { JobLogEntry, NewVmDetails, VmInfo } from '../common/interfaces';
import { VmManager } from '../controllers/vm.manager';
import { extractSubscriptionIdFromResourceId, generateGuid } from '../common/utils';
import { _getString } from '../common/apperror';
import { LogManager } from "../controllers/log.manager";

const createVmActivity: ActivityHandler = async (input: NewVmDetails, context: InvocationContext): Promise<VmInfo> => {

    const logger = new AzureLogger(context);
    logger.info('Activity function createVmActivity trigger request.');

    // Create Job Id (correlation Id) for operation
    const jobId = generateGuid();

    try {
        // Log start
        const msgStart = `Starting the creation of VM ${input.sourceSnapshot.vmName} from ${input.sourceSnapshot.id}`
        const logEntryStart: JobLogEntry = {
            jobId: jobId,
            jobOperation: 'VM Create Start',
            jobStatus: 'Restore In Progress',
            jobType: 'Restore',
            message: msgStart,
            vmName: input.sourceSnapshot.vmName,
            vmSize: input.sourceSnapshot.vmSize,
            diskProfile: input.sourceSnapshot.diskProfile,
            diskSku: input.sourceSnapshot.diskSku,
            snapshotId: input.sourceSnapshot.id,
            snapshotName: input.sourceSnapshot.snapshotName
        }
        const logManager = new LogManager(logger);
        await logManager.uploadLog(logEntryStart);

        // Create disk from snapshot
        const subscriptionId = extractSubscriptionIdFromResourceId(input.sourceSnapshot.id);
        const vmManager = new VmManager(logger, subscriptionId);
        const osDisk = await vmManager.createDiskFromSnapshot(input);

        logger.info(`✅ Successfully created new disk: ${osDisk.id}`);
        
        // Create VM in subnet
        const vm = await vmManager.createVirtualMachine(input, osDisk);
        
        logger.info(`✅ Successfully created VM: ${vm.name}`);

        // Log end
        const msgEnd = `Finished the creation of VM ${input.sourceSnapshot.vmName} from ${input.sourceSnapshot.id}`
        const logEntryEnd: JobLogEntry = {
            ...logEntryStart,
            jobOperation: 'VM Create End',
            jobStatus: 'Restore Completed',
            jobType: 'Restore',
            message: msgEnd,
            vmId: vm.id,
            ipAddress: vm.ipAddress
        }
        await logManager.uploadLog(logEntryEnd);

        return vm;
        
    } catch (error) {
        const msgFailActivity = `❌ Failed to create VM from snapshot ${input.sourceSnapshot.id}: ${_getString(error)}`;
        logger.error(msgFailActivity);

        // Activity failed
        const logEntryFailed: JobLogEntry = {
            jobId: jobId,
            jobOperation: 'Error',
            jobStatus: 'Restore Failed',
            jobType: 'Restore',
            message: msgFailActivity,
            vmName: input.sourceSnapshot.vmName,
            vmSize: input.sourceSnapshot.vmSize,
            diskProfile: input.sourceSnapshot.diskProfile,
            diskSku: input.sourceSnapshot.diskSku,
            snapshotId: input.sourceSnapshot.id,
            snapshotName: input.sourceSnapshot.snapshotName
        }
        const logManager = new LogManager(logger);
        await logManager.uploadLog(logEntryFailed);

        // This rethrown exception will only fail the individual invocation, instead of crashing the whole process
        throw error;
    }

};

df.app.activity(CREATE_VM_ACTIVITY, { handler: createVmActivity });

export default createVmActivity;