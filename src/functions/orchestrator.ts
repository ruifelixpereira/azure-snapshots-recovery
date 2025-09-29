import * as df from 'durable-functions';
import { OrchestrationContext, OrchestrationHandler } from 'durable-functions';
import { GET_MOST_RECENT_SNAPSHOTS_ACTIVITY, CREATE_VM_ACTIVITY } from '../common/constants';
import { BatchOrchestratorInput } from '../common/interfaces';
import { AzureLogger } from "../common/logger";
import { _getString } from '../common/apperror';


// Batch processing version (for large numbers of VMs)
const batchOrchestrator: OrchestrationHandler = function* (context: OrchestrationContext) {

    const logger = new AzureLogger(context);
    logger.info('Batch VM Recovery Orchestrator started');

    try {
        // Get input parameters from the orchestrator with proper typing
        const input = context.df.getInput() as BatchOrchestratorInput;
        
        // Log the input details for debugging
        logger.info('Orchestrator input received:', {
            targetSubnetIds: input.targetSubnetIds,
            subnetCount: input.targetSubnetIds.length,
            targetResourceGroup: input.targetResourceGroup,
            maxTimeGenerated: input.maxTimeGenerated,
            useOriginalIpAddress: input.useOriginalIpAddress,
            vmFilterCount: input.vmFilter?.length || 0
        });

        // Extract parameters with defaults
        const batchSize = parseInt(process.env.SNAP_RECOVERY_BATCH_SIZE || '20');
        const delayBetweenBatches = parseInt(process.env.SNAP_RECOVERY_DELAY_BETWEEN_BATCHES || '10');

        // Get snapshots with parameters
        const recoveryInfo = yield context.df.callActivity(GET_MOST_RECENT_SNAPSHOTS_ACTIVITY, input);

        if (!recoveryInfo?.snapshots?.length || !recoveryInfo?.subnetLocations?.length) {
            return { success: false, message: `No snapshots found in the same region of subnets ${input.targetSubnetIds.join(', ')}` };
        }
        
        // Start process
        logger.info(`Starting the restore for ${recoveryInfo.snapshots.length} VMs`);

        const allResults = [];
        
        // Process in batches
        for (let i = 0; i < recoveryInfo.snapshots.length; i += batchSize) {
            const batch = recoveryInfo.snapshots.slice(i, i + batchSize);

            // Batch start
            logger.info(`Processing batch ${Math.floor(i / batchSize) + 1} with ${batch.length} VMs`);

            const batchTasks = batch.map((snapshot, index) => {
                // Find a subnet in the same location as the snapshot
                const matchingSubnet = recoveryInfo.subnetLocations.find(
                    subnetLocation => subnetLocation.location === snapshot.location
                );
                
                if (!matchingSubnet) {
                    return { success: false, message: `No subnet found in location ${snapshot.location} for snapshot ${snapshot.snapshotName}` };
                }
                
                //logger.info(`Mapping snapshot ${snapshot.snapshotName} (${snapshot.location}) to subnet ${matchingSubnet.subnetId}`);
                return context.df.callActivity(CREATE_VM_ACTIVITY, {
                    targetSubnetId: matchingSubnet.subnetId,
                    targetResourceGroup: input.targetResourceGroup,
                    useOriginalIpAddress: input.useOriginalIpAddress,
                    sourceSnapshot: snapshot
                });
            });
            
            const batchResults = yield context.df.Task.all(batchTasks);
            allResults.push(...batchResults);

            // Optional: Add delay between batches to avoid rate limits
            if (i + batchSize < recoveryInfo.snapshots.length && delayBetweenBatches > 0) {
                const delay = context.df.currentUtcDateTime;
                delay.setSeconds(delay.getSeconds() + delayBetweenBatches);
                yield context.df.createTimer(delay);
            }
            
        }

        return {
            success: true,
            totalProcessed: allResults.length,
            input: input, // Include original input for reference
            results: allResults
        };
        
    } catch (error) {
        logger.error('Batch orchestrator failed:', error);
        throw error;
    }
};

// Register orchestrators
df.app.orchestration('batchOrchestrator', batchOrchestrator);

export { batchOrchestrator };