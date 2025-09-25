#!/bin/bash

# Service Principal Creation Script with Error Handling
# This script creates a service principal and deploys role assignments via Bicep

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

# Set the current directory to where the script lives
cd "$(dirname "$0")"

# Function to check if all required arguments have been set
check_required_arguments() {
    local missing_arguments=()
    for arg_name in "${required_vars[@]}"; do
        if [[ -z "${!arg_name}" ]]; then
            missing_arguments+=("${arg_name}")
        fi
    done
    
    if [[ ${#missing_arguments[@]} -gt 0 ]]; then
        echo -e "\nError: Missing required arguments:"
        printf '  %s\n' "${missing_arguments[@]}"
        echo "  Please provide a .env file with all required variables."
        echo ""
        exit 1
    fi
}

####################################################################################

echo "🚀 Service Principal Setup for Local Development"
echo "================================================"

# Check if all required arguments have been set
check_required_arguments

# Get Subscription and Tenant information
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
SP_NAME="${prefix}-local-dev-sp"

echo "📋 Configuration:"
echo "   Subscription: $SUBSCRIPTION_ID"
echo "   Tenant: $TENANT_ID"
echo "   Resource Group: $resourceGroupName"
echo "   Service Principal Name: $SP_NAME"
echo ""

####################################################################################

echo "🔍 Checking if service principal already exists..."

# Check if service principal already exists
existing_sp=$(az ad sp list --display-name "$SP_NAME" --query "[0].{appId:appId,objectId:id}" -o json 2>/dev/null || echo "null")

if [[ "$existing_sp" != "null" && "$existing_sp" != "[]" ]]; then
    echo "✅ Service principal '$SP_NAME' already exists"
    APP_ID=$(echo "$existing_sp" | jq -r '.appId')
    SP_OBJECT_ID=$(echo "$existing_sp" | jq -r '.objectId')
    
    echo "   App ID: $APP_ID"
    echo "   Object ID: $SP_OBJECT_ID"
    
    # Ask if user wants to reset the secret
    echo ""
    read -p "🔑 Do you want to generate a new secret for this service principal? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Generating new secret..."
        SECRET=$(az ad app credential reset \
            --id "$APP_ID" \
            --append \
            --end-date "$(date -u -d '3 months' +%Y-%m-%dT%H:%M:%SZ)" \
            --query password -o tsv)
        echo "✅ New secret generated"
    else
        echo "⚠️  Using existing service principal without new secret"
        echo "   You'll need to use an existing secret or generate one manually"
        SECRET="[EXISTING_SECRET_NOT_REGENERATED]"
    fi
    
    # Ask if user wants to skip role assignments
    echo ""
    read -p "🔐 Skip role assignment deployment (they might already exist)? (y/N): " -n 1 -r
    echo ""
    SKIP_ROLES="false"
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        SKIP_ROLES="true"
        echo "⏭️  Will skip role assignments"
    else
        echo "🔄 Will deploy/update role assignments"
    fi
else
    echo "🆕 Creating new service principal '$SP_NAME'..."
    
    # Create the application
    APP_ID=$(az ad app create \
        --display-name "$SP_NAME" \
        --query appId -o tsv)
    
    echo "✅ Application created with App ID: $APP_ID"
    
    # Create the service principal
    SP_OBJECT_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
    echo "✅ Service Principal created with Object ID: $SP_OBJECT_ID"
    
    # Generate a client secret (3 months expiry)
    SECRET=$(az ad app credential reset \
        --id "$APP_ID" \
        --append \
        --end-date "$(date -u -d '3 months' +%Y-%m-%dT%H:%M:%SZ)" \
        --query password -o tsv)
    
    echo "✅ Client secret generated (expires in 3 months)"
    SKIP_ROLES="false"
fi

####################################################################################

echo ""
echo "🔧 Deploying Bicep template for role assignments..."

# Deploy the Bicep template
DEPLOYMENT_OUTPUT=$(az deployment group create \
    --resource-group "$resourceGroupName" \
    --template-file service-principal-setup.bicep \
    --parameters \
        prefix="$prefix" \
        storageAccountName="$storageAccountName" \
        dcrName="$dcrName" \
        dceName="$dceName" \
        servicePrincipalObjectId="$SP_OBJECT_ID" \
        servicePrincipalClientId="$APP_ID" \
        servicePrincipalDisplayName="$SP_NAME" \
        skipExistingRoleAssignments="$SKIP_ROLES" \
    --query "properties.outputs" \
    --output json 2>/dev/null || {
        echo "❌ Bicep deployment failed"
        echo "This might be because:"
        echo "  1. Resources don't exist yet (run main deployment first)"
        echo "  2. Role assignments already exist (try with --skip-roles)"
        echo "  3. Insufficient permissions"
        exit 1
    })

echo "✅ Bicep deployment completed successfully!"

####################################################################################

echo ""
echo "📝 Generating local.settings.json..."

# Extract outputs from deployment
LOCAL_SETTINGS_JSON=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.localSettingsJson.value')

# Add the client secret to the configuration
LOCAL_SETTINGS_WITH_SECRET=$(echo "$LOCAL_SETTINGS_JSON" | jq --arg secret "$SECRET" '.Values.AZURE_CLIENT_SECRET = $secret')

# Save to file
echo "$LOCAL_SETTINGS_WITH_SECRET" | jq '.' > local.settings.dev.json

echo "✅ Configuration saved to: local.settings.dev.json"

####################################################################################

echo ""
echo "🎉 Service Principal Setup Complete!"
echo "===================================="
echo ""
echo "🔐 Service Principal Details:"
echo "   Name: $SP_NAME"
echo "   App ID: $APP_ID"
echo "   Object ID: $SP_OBJECT_ID"
echo "   Secret: [HIDDEN - check local.settings.dev.json]"
echo ""
echo "🔑 Permissions Granted:"
PERMISSIONS=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.permissionsSummary.value[]')
echo "$PERMISSIONS" | sed 's/^/   • /'
echo ""
echo "📋 Next Steps:"
echo "   1. Copy local.settings.dev.json to ../local.settings.json"
echo "   2. Start your Azure Functions: cd .. && func start"
echo "   3. The service principal will authenticate automatically"
echo ""
echo "⚠️  Secret expires in 3 months - set a calendar reminder!"
echo "   To regenerate: az ad app credential reset --id $APP_ID"
echo ""
echo "🔍 To verify setup:"
echo "   az storage blob list --account-name $storageAccountName --container-name test --auth-mode login"