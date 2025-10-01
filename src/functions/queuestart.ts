import { app, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { BatchOrchestratorInput } from '../common/interfaces';
import { isBatchOrchestratorInput, validateBatchOrchestratorInput, validateBatchOrchestratorInputStrict } from '../common/validation';

const queueStart = async (queueItem: BatchOrchestratorInput, context: InvocationContext): Promise<void> => {

    try {
        const client = df.getClient(context);
        context.log('✅ Durable Functions client obtained');
        
        // Parse queue message
        let messageText: string;
        
        if (typeof queueItem === 'string') {
            messageText = queueItem;
        } else if (queueItem && typeof queueItem === 'object') {
            // Handle case where queue message is already parsed JSON
            messageText = JSON.stringify(queueItem);
        } else {
            context.log('📄 Received:', typeof queueItem, queueItem);
            // Don't throw here, just return to consume the message
            return;
        }

        if (!messageText || messageText.trim() === '') {
            context.log('❌ Empty queue message - expected BatchOrchestratorInput JSON');
            // Don't throw here, just return to consume the message
            return;
        }

        context.log('📨 Processing queue message:', messageText.substring(0, 200)); // Log first 200 chars

        // Parse and validate JSON
        let input: BatchOrchestratorInput;
        try {
            context.log('🔍 Parsing JSON...');
            const parsed = JSON.parse(messageText);
            context.log('✅ JSON parsed successfully');
            
            // Check if input matches BatchOrchestratorInput structure
            context.log('🔍 Validating with type guard...');
            if (isBatchOrchestratorInput(parsed)) {
                input = parsed;
                context.log('✅ Input validation passed using type guard');
            } else {
                context.log('🔍 Type guard failed, trying detailed validator...');
                // Try to validate and get detailed error
                input = validateBatchOrchestratorInput(parsed);
                context.log('✅ Input validation passed using validator');
            }

            // Validate subnetid and resource group syntax
            context.log('🔍 Running strict validation...');
            input = validateBatchOrchestratorInputStrict(input);
            context.log('✅ Input validation passed using strict validator');
            
            // Log the validated input details (helpful for debugging)
            context.log('📋 Validated input:', {
                targetSubnetIds: input.targetSubnetIds,
                subnetCount: input.targetSubnetIds.length,
                targetResourceGroup: input.targetResourceGroup,
                useOriginalIpAddress: input.useOriginalIpAddress,
                hasVmFilters: !!input.vmFilter,
                vmFilterCount: input.vmFilter ? input.vmFilter.length : 0
            });
            
        } catch (error) {
            context.log('❌ Input validation or parsing failed:', error.message);
            context.log('📄 Error details:', error);
            
            // For validation errors, don't retry - consume the message
            context.log('🗑️ Consuming invalid message to prevent retry loop');
            return;
        }

        // Start the orchestrator with the validated input
        try {
            context.log('🔍 Starting orchestrator...');
            // The input will be available in orchestrator via context.df.getInput()
            const instanceId: string = await client.startNew('batchOrchestrator', { input });
            context.log('✅ Orchestrator started successfully');

            // Log instance ID for monitoring
            context.log('📊 Orchestration instance ID for monitoring:', instanceId);
            context.log('🏁 Queue function completed successfully');
        } catch (orchestratorError) {
            context.log('❌ Failed to start orchestrator:', orchestratorError.message);
            context.log('📄 Orchestrator error details:', orchestratorError);
            // This is a potentially retryable error, so throw it
            throw orchestratorError;
        }

    } catch (error) {
        context.log('❌ Unexpected error in queue start function:', error.message);
        context.log('📄 Full error details:', error);
        context.log('📄 Error stack:', error.stack);
        
        // For unexpected errors, let it retry
        throw error;
    }
};

// Register the function to listen to Azure Storage Queue
app.storageQueue('queueStart', {
    queueName: 'recovery-jobs', // Queue name
    connection: 'AzureWebJobsStorage', // Connection string setting name
    extraInputs: [df.input.durableClient()],
    handler: queueStart
});

export default queueStart;