#!/bin/bash

# Service Principal Creation and Setup Script
# Creates a service principal, deploys role assignments, and generates local.settings.json

set -e  # Exit on any error

# Load environment variables
set -a && source .env && set +a

# Required variables
required_vars=(
    "prefix"
    "resourceGroupName"
    "storageAccountName"
    "dcrName"
    "dceName"
)

# Optional variables with defaults
localDevelopmentAppName="${localDevelopmentAppName:-local-dev-service-principal}"

# Set the current directory to where the script lives
cd "$(dirname "$0")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if all required arguments have been set
check_required_arguments() {
    local missing_arguments=()
    for arg_name in "${required_vars[@]}"; do
        if [[ -z "${!arg_name}" ]]; then
            missing_arguments+=("${arg_name}")
        fi
    done
    
    if [[ ${#missing_arguments[@]} -gt 0 ]]; then
        print_error "Missing required arguments:"
        printf '  %s\n' "${missing_arguments[@]}"
        echo "  Please provide a .env file with all required variables."
        echo ""
        exit 1
    fi
}

# Function to cleanup on error
cleanup_on_error() {
    if [[ -n "${SP_APP_ID:-}" ]]; then
        print_warning "Cleaning up service principal due to error..."
        az ad app delete --id "$SP_APP_ID" 2>/dev/null || true
    fi
}

# Set trap to cleanup on error
trap cleanup_on_error ERR

####################################################################################

print_status "Starting Service Principal Setup for Local Development"
echo "=================================================="

# Check if all required arguments have been set
check_required_arguments

# Get Subscription and Tenant IDs
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

print_status "Using subscription: $SUBSCRIPTION_ID"
print_status "Using tenant: $TENANT_ID"
print_status "Using resource group: $resourceGroupName"

####################################################################################

print_status "Creating Service Principal..."

# Check if service principal already exists
existing_sp=$(az ad sp list --display-name "$localDevelopmentAppName" --query "[0].appId" -o tsv 2>/dev/null)

if [[ -n "$existing_sp" && "$existing_sp" != "null" ]]; then
    print_warning "Service Principal '$localDevelopmentAppName' already exists"
    print_status "Using existing Service Principal with App ID: $existing_sp"
    SP_APP_ID="$existing_sp"
    SP_OBJECT_ID=$(az ad sp show --id "$SP_APP_ID" --query id -o tsv)
else
    # Create new service principal
    print_status "Creating new Service Principal: $localDevelopmentAppName"
    
    # Create the application
    SP_APP_ID=$(az ad app create \
        --display-name "$localDevelopmentAppName" \
        --query appId -o tsv)
    
    print_success "Application created with App ID: $SP_APP_ID"
    
    # Create the service principal
    SP_OBJECT_ID=$(az ad sp create --id "$SP_APP_ID" --query id -o tsv)
    print_success "Service Principal created with Object ID: $SP_OBJECT_ID"
fi

# Generate or reset client secret
print_status "Generating client secret..."
SP_SECRET=$(az ad app credential reset \
    --id "$SP_APP_ID" \
    --append \
    --end-date "$(date -u -d '3 months' +%Y-%m-%dT%H:%M:%SZ)" \
    --query password -o tsv)

print_success "Client secret generated (expires in 3 months)"

####################################################################################

print_status "Deploying role assignments via Bicep template..."

# Deploy the Bicep template for role assignments
DEPLOYMENT_OUTPUT=$(az deployment group create \
    --resource-group "$resourceGroupName" \
    --template-file service-principal-setup.bicep \
    --parameters \
        prefix="$prefix" \
        storageAccountName="$storageAccountName" \
        dcrName="$dcrName" \
        dceName="$dceName" \
        servicePrincipalObjectId="$SP_OBJECT_ID" \
        servicePrincipalClientId="$SP_APP_ID" \
        servicePrincipalDisplayName="$localDevelopmentAppName" \
    --query "properties.outputs" \
    --output json)

if [[ $? -eq 0 ]]; then
    print_success "Bicep deployment completed successfully!"
else
    print_error "Bicep deployment failed!"
    exit 1
fi

####################################################################################

# Extract outputs from deployment
LOGS_INGESTION_ENDPOINT=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.logsIngestionEndpoint.value')
LOGS_INGESTION_RULE_ID=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.logsIngestionRuleId.value')
LOGS_INGESTION_STREAM_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.logsIngestionStreamName.value')
PERMISSIONS=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.permissionsSummary.value[]')

print_status "Generating local.settings.dev.json..."

# Generate local.settings.dev.json
cat > ../local.settings.dev.json <<EOF
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage__accountname": "$storageAccountName",
    "AZURE_TENANT_ID": "$TENANT_ID",
    "AZURE_CLIENT_ID": "$SP_APP_ID",
    "AZURE_CLIENT_SECRET": "$SP_SECRET",
    "LOGS_INGESTION_ENDPOINT": "$LOGS_INGESTION_ENDPOINT",
    "LOGS_INGESTION_RULE_ID": "$LOGS_INGESTION_RULE_ID",
    "LOGS_INGESTION_STREAM_NAME": "$LOGS_INGESTION_STREAM_NAME",
    "SNAP_RECOVERY_BATCH_SIZE": "20",
    "SNAP_RECOVERY_DELAY_BETWEEN_BATCHES": "10"
  }
}
EOF

# Generate .env.local for easy reference
cat > ../.env.local <<EOF
# Service Principal Credentials for Local Development
# Generated on $(date)

AZURE_TENANT_ID=$TENANT_ID
AZURE_CLIENT_ID=$SP_APP_ID
AZURE_CLIENT_SECRET=$SP_SECRET
SUBSCRIPTION_ID=$SUBSCRIPTION_ID

# Service Principal Details
SP_DISPLAY_NAME=$localDevelopmentAppName
SP_OBJECT_ID=$SP_OBJECT_ID

# Resource Information
RESOURCE_GROUP=$resourceGroupName
STORAGE_ACCOUNT=$storageAccountName
LOGS_INGESTION_ENDPOINT=$LOGS_INGESTION_ENDPOINT
LOGS_INGESTION_RULE_ID=$LOGS_INGESTION_RULE_ID
EOF

####################################################################################

print_success "Service Principal Setup Complete!"
echo ""
echo "=================================================="
echo "🔐 SERVICE PRINCIPAL DETAILS"
echo "=================================================="
echo "Display Name: $localDevelopmentAppName"
echo "Application ID: $SP_APP_ID"
echo "Object ID: $SP_OBJECT_ID"
echo "Tenant ID: $TENANT_ID"
echo ""
echo "📋 PERMISSIONS GRANTED:"
while IFS= read -r permission; do
    echo "  ✓ $permission"
done <<< "$PERMISSIONS"
echo ""
echo "📁 FILES CREATED:"
echo "  ✓ local.settings.dev.json (Function App configuration)"
echo "  ✓ .env.local (Environment variables reference)"
echo ""
echo "🚀 NEXT STEPS:"
echo "1. Copy local.settings.dev.json to local.settings.json"
echo "2. Start your Azure Functions: func start"
echo "3. Your code will use the service principal credentials automatically"
echo ""
echo "⚠️  SECURITY NOTES:"
echo "• Client secret expires in 3 months"
echo "• Store credentials securely"
echo "• Don't commit local.settings.json or .env.local to version control"
echo ""
echo "🔄 TO ROTATE CREDENTIALS:"
echo "Run this script again - it will generate a new secret"

# Disable error trap
trap - ERR