// Resource Graph
import { ILogger } from '../common/logger';
import { DefaultAzureCredential } from "@azure/identity";
import { ResourceGraphClient } from "@azure/arm-resourcegraph";
import { RecoverySnapshot } from "../common/interfaces";
import { ResourceGraphError, _getString } from "../common/apperror";

export class ResourceGraphManager {

    private clientGraph: ResourceGraphClient;

    constructor(private logger: ILogger) {
        const credential = new DefaultAzureCredential();
        this.clientGraph = new ResourceGraphClient(credential);
    }

    // Get the most recent snapshots in a certain region for all VMs
    public async getMostRecentSnapshotsInRegion(region: string): Promise<Array<RecoverySnapshot>> {

        try {

            const query = `resources
                    | where type == 'microsoft.compute/snapshots'
                    | where location == '${region}'
                    | where tags['smcp-recovery-info'] != ''
                    | extend smcpRecoveryInfo = tostring(tags['smcp-recovery-info'])
                    | extend vmName = extract('vmName\\\":\\\"([^\\\"]+)', 1, smcpRecoveryInfo)
                    | project snapshotName = name, vmName, timeCreated = todatetime(properties.timeCreated)
                    | summarize latestSnapshotTime = max(timeCreated) by vmName
                    | join kind=inner (
                        resources
                        | where type == 'microsoft.compute/snapshots'
                        | where tags['smcp-recovery-info'] != ''
                        | extend smcpRecoveryInfo = tostring(tags['smcp-recovery-info']) 
                        | extend vmName = extract('vmName\\\":\\\"([^\\\"]+)', 1, smcpRecoveryInfo), vmSize = extract('vmSize\\\":\\\"([^\\\"]+)', 1, smcpRecoveryInfo), diskSku = extract('diskSku\\\":\\\"([^\\\"]+)', 1, smcpRecoveryInfo), diskProfile = extract('diskProfile\\\":\\\"([^\\\"]+)', 1, smcpRecoveryInfo), ipAddress = extract('ipAddress\\\":\\\"([^\\\"]+)', 1, smcpRecoveryInfo), securityType = coalesce(extract('securityType\\\":\\\"([^\\\"]+)', 1, smcpRecoveryInfo), 'Standard')
                        | project snapshotName = name, vmName, vmSize, diskSku, diskProfile, ipAddress, timeCreated = todatetime(properties.timeCreated), resourceGroup, id, location, securityType
                        ) on vmName, $left.latestSnapshotTime == $right.timeCreated
                    | project snapshotName, resourceGroup, id, location, timeCreated, vmName, vmSize, diskSku, diskProfile, ipAddress, securityType`;

            const result = await this.clientGraph.resources(
                {
                    query: query
                },
                { resultFormat: "table" }
            );

            return result.data;
        } catch (error) {
            const message = `Unable to query resource graph with error: ${_getString(error)}`;
            this.logger.error(message);
            throw new ResourceGraphError(message);
        }
    }

}
