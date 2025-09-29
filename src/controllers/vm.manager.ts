// Disk snapshots
import { ILogger } from '../common/logger';
import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { DefaultAzureCredential } from "@azure/identity";
import { VmError, _getString } from "../common/apperror";
import { NewVmDetails, VmDisk, VmNic, VmInfo } from '../common/interfaces';
import { formatDateYYYYMMDDTHHMM } from '../common/utils';

 
export class VmManager {

    private credential: DefaultAzureCredential;
    private computeClient: ComputeManagementClient;
    private networkClient: NetworkManagementClient;
    private subscriptionId: string;

    constructor(private logger: ILogger, subscriptionId: string) {
        const credential = new DefaultAzureCredential();
        this.credential = credential;
        this.computeClient = new ComputeManagementClient(credential, subscriptionId);
        this.networkClient = new NetworkManagementClient(credential, subscriptionId);
        this.subscriptionId = subscriptionId;
    }

    public async createDiskFromSnapshot(source: NewVmDetails): Promise<VmDisk> {

        try {
            let newDisk: VmDisk = null;
            let diskExists = false;
            const diskName = `${source.sourceSnapshot.vmName}-${source.sourceSnapshot.diskProfile}-${formatDateYYYYMMDDTHHMM(new Date())}`;

            /*
            try {
                const result = await this.computeClient.disks.get(source.targetResourceGroup, diskName);
                diskExists = true;
                newDisk = {
                    id: result.id,
                    name: diskName,
                    osType: result.osType
                };
            } catch {}
            */
            

            if (!diskExists) {
                const result = await this.computeClient.disks.beginCreateOrUpdateAndWait(source.targetResourceGroup, diskName, {
                    location: source.sourceSnapshot.location,
                    creationData: {
                        createOption: "Copy",
                        sourceResourceId: source.sourceSnapshot.id
                    },
                    tags: { 
                        "smcp-creation": "recovery"
                    }
                });

                newDisk = {
                    id: result.id,
                    name: diskName,
                    osType: result.osType
                };

            }

            return newDisk;

        } catch (error) {
            const message = `Unable to create disk from snapshot '${source.sourceSnapshot.id}' with error: ${_getString(error)}`;
            this.logger.error(message);
            throw new VmError(message);
        }
    }


    /**
     * Creates a network interface in the specified subnet using Azure SDK
     * @param resourceGroupName Resource group name
     * @param nicName Network interface name
     * @param subnetId Full subnet ID
     * @param location Azure region
     * @param useOriginalIpAddress Whether to use original IP or dynamic allocation
     * @param originalIpAddress Original IP address from snapshot (optional)
     * @returns Network interface details
     */
    private async createNetworkInterface(
        resourceGroupName: string, 
        nicName: string, 
        subnetId: string, 
        location: string,
        useOriginalIpAddress: boolean,
        originalIpAddress?: string
    ): Promise<VmNic> {
        try {
            this.logger.info(`Creating network interface ${nicName} in subnet ${subnetId}`);
            
            // Determine IP allocation method and address
            let ipConfiguration: any;
            
            if (useOriginalIpAddress && originalIpAddress) {
                this.logger.info(`Using static IP allocation with original IP: ${originalIpAddress}`);
                ipConfiguration = {
                    name: 'ipconfig1',
                    privateIPAllocationMethod: 'Static',
                    privateIPAddress: originalIpAddress,
                    subnet: {
                        id: subnetId
                    }
                };
            } else {
                if (useOriginalIpAddress && !originalIpAddress) {
                    this.logger.warn(`Original IP address requested but not available, falling back to dynamic allocation`);
                } else {
                    this.logger.info(`Using dynamic IP allocation`);
                }
                
                ipConfiguration = {
                    name: 'ipconfig1',
                    privateIPAllocationMethod: 'Dynamic',
                    subnet: {
                        id: subnetId
                    }
                };
            }

            // Create network interface using Azure SDK
            const nicParameters = {
                location: location,
                ipConfigurations: [ipConfiguration],
                tags: {
                    "smcp-creation": "recovery",
                    "ip-allocation": useOriginalIpAddress ? "static-requested" : "dynamic"
                }
            };

            const nicResult = await this.networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
                resourceGroupName,
                nicName,
                nicParameters
            );

            const nicOutput: VmNic = {
                id: nicResult.id,
                name: nicName,
                ipAddress: nicResult.ipConfigurations?.[0]?.privateIPAddress || 'Unknown'
            };

            this.logger.info(`Successfully created network interface: ${nicOutput.id} with IP: ${nicOutput.ipAddress}`);
            return nicOutput;

        } catch (error) {
            const message = `Unable to create network interface ${nicName}: ${_getString(error)}`;
            this.logger.error(message);
            throw new VmError(message);
        }
    }


    public async createVirtualMachine(source: NewVmDetails, osDisk: VmDisk): Promise<VmInfo> {

        try {
            let newVm: VmInfo = null;
            let vmExists = false;

            if (!vmExists) {
                // Create network interface in the target subnet
                const nic = await this.createNetworkInterface(
                    source.targetResourceGroup,
                    `${source.sourceSnapshot.vmName}-nic`,
                    source.targetSubnetId,
                    source.sourceSnapshot.location,
                    source.useOriginalIpAddress,
                    source.sourceSnapshot.ipAddress
                );

                // Step 2: Create the virtual machine
                let vmConfig: any = {
                    location: source.sourceSnapshot.location,
                    hardwareProfile: { vmSize: source.sourceSnapshot.vmSize },
                    storageProfile: {
                        osDisk: {
                            osType: osDisk.osType,
                            name: osDisk.name,
                            createOption: "Attach",
                            managedDisk: { id: osDisk.id }
                        }
                    },
                    // Note: When attaching existing OS disk, don't include osProfile
                    // The OS configuration comes from the attached disk
                    networkProfile: {
                        networkInterfaces: [{
                            id: nic.id,
                            primary: true
                        }]
                    },
                    // Enable boot diagnostics
                    diagnosticsProfile: {
                        bootDiagnostics: {
                            enabled: true
                        }
                    },
                    tags: { 
                        "smcp-creation": "recovery"
                    }
                };

                // Only add security profile if source snapshot has TrustedLaunch security type
                if (source.sourceSnapshot.securityType === "TrustedLaunch") {
                    vmConfig.securityProfile = {
                        uefiSettings: {
                            secureBootEnabled: true,
                            vTpmEnabled: true
                        },
                        securityType: "TrustedLaunch"
                    };
                    //this.logger.info(`Adding TrustedLaunch security profile to VM: ${source.sourceSnapshot.vmName}`);
                }

                const result = await this.computeClient.virtualMachines.beginCreateOrUpdateAndWait(source.targetResourceGroup, source.sourceSnapshot.vmName, vmConfig);

                newVm = {
                    id: result.id,
                    name: result.name,
                    ipAddress: nic.ipAddress
                };

                this.logger.info(`Successfully created VM: ${newVm.name} with ID: ${newVm.id} and IP address: ${newVm.ipAddress}`);
            }

            return newVm;

        } catch (error) {
            const message = `Unable to create vm from snapshot '${source.sourceSnapshot.id}' with error: ${_getString(error)}`;
            this.logger.error(message);
            throw new VmError(message);
        }
    }

}
