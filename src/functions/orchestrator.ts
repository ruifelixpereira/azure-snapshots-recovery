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
        //context.log('Received input:', input);

        // Extract parameters with defaults
        const batchSize = parseInt(process.env.SNAP_RECOVERY_BATCH_SIZE || '20');
        const delayBetweenBatches = parseInt(process.env.SNAP_RECOVERY_DELAY_BETWEEN_BATCHES || '10');

        // Get snapshots with parameters
        const snapshots = yield context.df.callActivity(GET_MOST_RECENT_SNAPSHOTS_ACTIVITY, input);
        
        if (!snapshots?.length) {
            return { success: false, message: `No snapshots found in the same region of subnet ${input.targetSubnetId}` };
        }

        // Start process
        logger.info(`Starting the restore for ${snapshots.length} VMs`);
        
        const allResults = [];
        
        // Process in batches
        for (let i = 0; i < snapshots.length; i += batchSize) {
            const batch = snapshots.slice(i, i + batchSize);

            // Batch start
            logger.info(`Processing batch ${Math.floor(i / batchSize) + 1} with ${batch.length} VMs`);

            const batchTasks = batch.map((snapshot, index) => 
                context.df.callActivity(CREATE_VM_ACTIVITY, {
                    targetSubnetId: input.targetSubnetId,
                    targetResourceGroup: input.targetResourceGroup,
                    sourceSnapshot: snapshot
                })
            );
            
            const batchResults = yield context.df.Task.all(batchTasks);
            allResults.push(...batchResults);

            // Optional: Add delay between batches to avoid rate limits
            if (i + batchSize < snapshots.length && delayBetweenBatches > 0) {
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