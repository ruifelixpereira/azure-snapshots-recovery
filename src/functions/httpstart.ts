import { app, HttpHandler, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { BatchOrchestratorInput } from '../common/interfaces';
import { isBatchOrchestratorInput, validateBatchOrchestratorInput, validateBatchOrchestratorInputStrict } from '../common/validation';

const httpStart: HttpHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    const client = df.getClient(context);
    
    try {
        const bodyText = await request.text();
        
        if (!bodyText || bodyText.trim() === '') {
            context.log('❌ Empty request body - expected BatchOrchestratorInput JSON');
            // Use dummy instance ID for error responses
            return client.createCheckStatusResponse(request, 'invalid-request');
        }

        // Parse and validate JSON
        let input: BatchOrchestratorInput;
        try {
            const parsed = JSON.parse(bodyText);
            
            // Check if input matches BatchOrchestratorInput structure
            if (isBatchOrchestratorInput(parsed)) {
                input = parsed;
                //context.log('✅ Input validation passed using type guard');
            } else {
                // Try to validate and get detailed error
                input = validateBatchOrchestratorInput(parsed);
                //context.log('✅ Input validation passed using validator');
            }

            // Validate subnetid and resource group syntax
            input = validateBatchOrchestratorInputStrict(input);
            
            // Log the validated input details (helpful for debugging)
            context.log('✅ Input validation passed using strict validator');
            context.log('📋 Validated input:', {
                targetSubnetId: input.targetSubnetId,
                targetResourceGroup: input.targetResourceGroup,
                hasVmFilters: !!input.vmFilter,
                vmFilterCount: input.vmFilter ? input.vmFilter.length : 0
            });
            
        } catch (error) {
            context.log('❌ Input validation or parsing failed:', error.message);
            context.log('📄 Received body preview:', bodyText.substring(0, 200)); // Log first 200 chars
            
            // Return error response with dummy instance ID
            return client.createCheckStatusResponse(request, 'validation-failed');
        }

        // Start the orchestrator with the validated input
        // The input will be available in orchestrator via context.df.getInput()
        const instanceId: string = await client.startNew(request.params.orchestratorName, { input });

        context.log(`✅ Successfully started orchestration '${request.params.orchestratorName}' with ID = '${instanceId}'`);
        context.log('🎯 Processing subnet:', input.targetSubnetId.split('/').pop()); // Log subnet name only
        context.log('📁 Target resource group:', input.targetResourceGroup);

        // Return the standard durable functions response
        return client.createCheckStatusResponse(request, instanceId);

    } catch (error) {
        context.log('❌ Unexpected error in HTTP start function:', error);
        // Return error response with dummy instance ID
        return client.createCheckStatusResponse(request, 'internal-error');
    }
};

app.http('httpStart', {
    route: 'orchestrators/{orchestratorName}',
    extraInputs: [df.input.durableClient()],
    handler: httpStart,
});

export default httpStart;