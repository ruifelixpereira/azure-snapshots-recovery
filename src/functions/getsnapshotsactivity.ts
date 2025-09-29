import * as df from 'durable-functions';
import { ActivityHandler } from 'durable-functions';
import { InvocationContext } from '@azure/functions';

import { GET_MOST_RECENT_SNAPSHOTS_ACTIVITY } from '../common/constants';
import { AzureLogger } from "../common/logger";
import { ResourceGraphManager } from "../controllers/graph.manager";
import { BatchOrchestratorInput, RecoveryInfo, RecoverySnapshot } from '../common/interfaces';
import { AzureLocationResolver } from '../common/azure-location-resolver';

// Activity functions receive context as the second parameter
const getSnapshotsActivity: ActivityHandler = async (input: BatchOrchestratorInput, context: InvocationContext): Promise<RecoveryInfo> => {

    const logger = new AzureLogger(context);
    logger.info(`Activity function getSnapshotsActivity trigger request for snapshots targeting ${input.targetSubnetIds.length} subnets.`);

    try {
        // Get the locations for all subnet IDs using the new resolver
        const locationResolver = new AzureLocationResolver(logger);
        const subnetLocations = await locationResolver.getSubnetLocations(input.targetSubnetIds);
        
        // Get unique locations from all subnets
        const uniqueLocations = [...new Set(subnetLocations.map(sl => sl.location))];
        logger.info(`Determined ${uniqueLocations.length} unique locations: ${uniqueLocations.join(', ')} for ${subnetLocations.length} subnets`);

        // Get snapshots from all regions
        const graphManager = new ResourceGraphManager(logger);

        const snapshots = await graphManager.getMostRecentSnapshotsInRegions(uniqueLocations, new Date(input.maxTimeGenerated));
        logger.info(`Found ${snapshots.length} snapshots in regions ${uniqueLocations.join(', ')}`);
        return { snapshots, subnetLocations };

    } catch (err) {
        logger.error('Error in getSnapshotsActivity:', err);
        // This rethrown exception will only fail the individual invocation, instead of crashing the whole process
        throw err;
    }

};

df.app.activity(GET_MOST_RECENT_SNAPSHOTS_ACTIVITY, { handler: getSnapshotsActivity });

export default getSnapshotsActivity;