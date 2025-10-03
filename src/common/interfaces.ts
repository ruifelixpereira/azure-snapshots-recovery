// interfaces.ts

// Define input type for the orchestrator
export interface RecoveryBatch {
    targetSubnetIds: string[]; // Array of subnet IDs
    targetResourceGroup: string;
    maxTimeGenerated: string; // ISO datetime string
    useOriginalIpAddress: boolean; // Whether to preserve original IP addresses
    waitForVmCreationCompletion: boolean; // Whether to wait for VM creation to complete
    vmFilter?: string[];
    batchId?: string;
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
    batchId: string;
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

export interface VmCreationPollMessage {
    pollerUrl: string;
    operationId: string;
    vmName: string;
    targetResourceGroup: string;
    sourceSnapshot: RecoverySnapshot;
    nicInfo: VmNic;
    jobId: string;
    batchId: string;
    createdAt: string; // ISO datetime
    retryCount?: number;
}

export interface VmCreationResult {
    success: boolean;
    vmInfo?: VmInfo;
    pollerMessage?: VmCreationPollMessage;
    error?: string;
}

export interface JobLogEntry {
    batchId: string;
    jobId: string;
    jobOperation: 'VM Create Start' | 'VM Create End' | 'VM Create Polling' |'Error';
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

export interface TrackingInfo {
    batchId: string;
    jobId: string;
}
