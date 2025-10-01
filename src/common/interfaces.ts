// interfaces.ts

// Define input type for the orchestrator
export interface BatchOrchestratorInput {
    targetSubnetIds: string[]; // Array of subnet IDs
    targetResourceGroup: string;
    maxTimeGenerated: string; // ISO datetime string
    useOriginalIpAddress: boolean; // Whether to preserve original IP addresses
    vmFilter?: string[];
}

export interface RecoverySnapshot {
    snapshotName: string;
    resourceGroup: string;
    id: string;
    location: string;
    timeCreated: string;
    vmName: string;
    vmSize: string;
    diskSku: string;
    diskProfile: 'os-disk' | 'data-disk';
    ipAddress: string;
    securityType: string;
}

export interface NewVmDetails {
    targetSubnetId: string; // Single subnet ID for individual VM creation
    targetResourceGroup: string;
    useOriginalIpAddress: boolean; // Whether to preserve original IP addresses
    sourceSnapshot: RecoverySnapshot;
}

export interface VmDisk {
    name: string;
    id: string;
    osType: "Windows" | "Linux";
}

export interface VmInfo {
    name: string;
    id: string;
    ipAddress: string;
}

export interface VmNic {
    name: string;
    id: string;
    ipAddress: string;
}

export interface JobLogEntry {
    jobId: string;
    jobOperation: 'VM Create Start' | 'VM Create End' | 'Error';
    jobStatus: 'Restore In Progress' | 'Restore Completed' | 'Restore Failed';
    jobType: 'Restore';
    message: string;
    snapshotId: string;
    snapshotName: string;
    vmName: string;
    vmSize: string;
    diskSku: string;
    diskProfile: 'os-disk' | 'data-disk';
    vmId?: string;
    ipAddress?: string;
}

export interface SubnetLocation {
    subnetId: string;
    location: string;
}

export interface RecoveryInfo {
    snapshots: RecoverySnapshot[];
    subnetLocations: SubnetLocation[];
}