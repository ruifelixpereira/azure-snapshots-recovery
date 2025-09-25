// interfaces.ts

export interface VmFilter {
    vm: string;
}

// Define input type for the orchestrator
export interface BatchOrchestratorInput {
    targetSubnetId: string;
    targetResourceGroup: string;
    vmFilter?: VmFilter[];
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
    targetSubnetId: string;
    targetResourceGroup: string;
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