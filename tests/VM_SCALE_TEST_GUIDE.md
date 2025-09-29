# Creating 120 Ubuntu VMs for Scale Testing

This guide shows how to create 120 Ubuntu virtual machines with specific requirements for scale testing.

## VM Specifications

- **Count**: 120 VMs
- **OS**: Ubuntu 22.04 LTS
- **Size**: Standard_B2ls_v2 (2 vCPUs, 4GB RAM, burstable)
- **Tag**: `smcp-backup = on`
- **Network**: No public IP, no NSG
- **Authentication**: SSH key only (no password)

## Method 1: Using the Bash Script (Recommended)

### Quick Start

1. **Set up the environment**:
```bash
# Copy the configuration template
cp tests/.env.scale-test tests/.env

# Edit the configuration
nano tests/.env
```

2. **Create the VMs**:
```bash
cd tests
chmod +x create-scale-vms.sh
./create-scale-vms.sh create
```

### Configuration Options

Edit the `.env` file to customize:

```bash
# VM Configuration
VM_COUNT=120                    # Number of VMs to create
VM_SIZE=Standard_B2ls_v2       # VM size
VM_PREFIX=scale-test-vm        # VM name prefix (results in scale-test-vm-001, etc.)
ADMIN_USERNAME=azureuser       # Admin username
SSH_KEY_PATH=$HOME/.ssh/id_rsa.pub  # SSH public key path

# Azure Configuration
RESOURCE_GROUP=scale-test-rg   # Resource group name
LOCATION=eastus                # Azure region
VNET_NAME=scale-test-vnet     # Virtual network name
SUBNET_NAME=default           # Subnet name

# Performance Configuration
BATCH_SIZE=10                  # VMs to create in parallel per batch
```

### Script Usage

```bash
# Create VMs (default action)
./create-scale-vms.sh create

# List existing VMs with smcp-backup tag
./create-scale-vms.sh list

# Cleanup (delete all VMs with smcp-backup tag)
./create-scale-vms.sh cleanup
```

### What the Script Does

1. ✅ **Checks prerequisites** (Azure CLI login, SSH keys)
2. ✅ **Creates resource group** (if needed)
3. ✅ **Sets up network infrastructure** (VNet and subnet)
4. ✅ **Creates VMs in batches** (10 at a time by default)
5. ✅ **Adds proper tags** (`smcp-backup=on`, `purpose=scale-test`)
6. ✅ **No public IPs** (VMs are private only)
7. ✅ **No NSG assignment** (uses subnet-level security)
8. ✅ **Progress tracking** with colored output

## Method 2: Using Bicep Template

### Deploy with Azure CLI

```bash
# Generate SSH key if needed
ssh-keygen -t rsa -b 4096 -f ~/.ssh/scale-test -N ""

# Deploy the template
az deployment group create \
  --resource-group "scale-test-rg" \
  --template-file "tests/scale-test-vms.bicep" \
  --parameters \
    vmCount=120 \
    vmSize="Standard_B2ls_v2" \
    vmPrefix="scale-test-vm" \
    adminUsername="azureuser" \
    sshPublicKey="$(cat ~/.ssh/scale-test.pub)" \
    location="eastus"
```

### Using Parameters File

Create `scale-test-vms.bicepparam`:

```bicep
using 'scale-test-vms.bicep'

param vmCount = 120
param vmSize = 'Standard_B2ls_v2'
param vmPrefix = 'scale-test-vm'
param adminUsername = 'azureuser'
param sshPublicKey = loadTextContent('~/.ssh/id_rsa.pub')
param location = 'eastus'
param vnetName = 'scale-test-vnet'
param subnetName = 'default'
```

Then deploy:
```bash
az deployment group create \
  --resource-group "scale-test-rg" \
  --parameters scale-test-vms.bicepparam
```

## VM Naming Convention

VMs will be named with zero-padded numbers:
- `scale-test-vm-001`
- `scale-test-vm-002`
- `scale-test-vm-003`
- ...
- `scale-test-vm-120`

## Network Configuration

- **VNet**: 10.0.0.0/16
- **Subnet**: 10.0.1.0/24 (supports ~254 VMs)
- **Private IPs**: Assigned dynamically
- **No Public IPs**: VMs are not accessible from internet
- **No NSG**: Uses default Azure security

## Resource Requirements

### Estimated Costs (per month in East US)
- **120 x Standard_B2ls_v2**: ~$1,800/month
- **120 x Premium SSD (32GB)**: ~$600/month
- **Network**: ~$50/month
- **Total**: ~$2,450/month

### Azure Quotas Needed
- **vCPU Quota**: 240 vCPUs (Standard BS Family)
- **Storage**: 120 managed disks
- **Network**: 120 NICs

## Management Commands

### List VMs with Tags
```bash
az vm list \
  --resource-group "scale-test-rg" \
  --query "[?tags.\"smcp-backup\" == 'on'].{Name:name, Size:hardwareProfile.vmSize, Status:provisioningState}" \
  --output table
```

### Connect to a VM
```bash
# Get private IP
PRIVATE_IP=$(az vm show \
  --resource-group "scale-test-rg" \
  --name "scale-test-vm-001" \
  --show-details \
  --query "privateIps" \
  --output tsv)

# Connect via SSH (requires VPN/bastion/jump host)
ssh -i ~/.ssh/id_rsa azureuser@$PRIVATE_IP
```

### Create Snapshots of All VMs
```bash
# Create snapshots for all VMs with the tag
az vm list \
  --resource-group "scale-test-rg" \
  --query "[?tags.\"smcp-backup\" == 'on'].name" \
  --output tsv | while read vm_name; do
    
    # Get OS disk name
    disk_name=$(az vm show \
      --resource-group "scale-test-rg" \
      --name "$vm_name" \
      --query "storageProfile.osDisk.name" \
      --output tsv)
    
    # Create snapshot
    az snapshot create \
      --resource-group "scale-test-rg" \
      --name "${vm_name}-snapshot-$(date +%Y%m%d)" \
      --source "$disk_name" \
      --tags "smcp-backup=on" "source-vm=$vm_name"
done
```

### Cleanup All Resources
```bash
# Delete all VMs (keeps other resources)
./create-scale-vms.sh cleanup

# Delete entire resource group (removes everything)
az group delete --name "scale-test-rg" --yes --no-wait
```

## Troubleshooting

### Common Issues

1. **Quota Exceeded**:
   ```bash
   # Check current quota
   az vm list-usage --location eastus --query "[?name.value=='standardBSFamily']"
   
   # Request quota increase in Azure portal
   ```

2. **SSH Key Not Found**:
   ```bash
   # Generate new SSH key
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
   ```

3. **Network Address Exhaustion**:
   - Default subnet supports ~254 VMs
   - Increase subnet size if needed: `10.0.0.0/22` (supports ~1022 VMs)

4. **Rate Limiting**:
   - Script includes 30-second delays between batches
   - Reduce `BATCH_SIZE` if experiencing throttling

### Monitoring Progress

```bash
# Watch VM creation progress
watch -n 30 'az vm list --resource-group "scale-test-rg" --query "length([?tags.\"smcp-backup\" == \"on\"])"'

# Check for failed VMs
az vm list \
  --resource-group "scale-test-rg" \
  --query "[?provisioningState != 'Succeeded' && tags.\"smcp-backup\" == 'on'].{Name:name, State:provisioningState}" \
  --output table
```

## Next Steps

Once VMs are created, you can:
1. **Test snapshot functionality** with your recovery tools
2. **Install monitoring agents** if needed
3. **Create VM extensions** for additional software
4. **Set up backup policies** using Azure Backup
5. **Test your snapshot recovery orchestrator** against these VMs

The VMs are ready to be used as test targets for your Azure Functions snapshot recovery workflow!