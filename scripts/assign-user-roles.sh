#!/bin/bash

# Enhanced script to assign roles to the currently logged-in user
# This script assigns necessary roles for Azure Functions development and deployment

# load environment variables
set -a && source .env && set +a

# Required variables
required_vars=(
    "resourceGroupName"
    "storageAccountName"
)

# Set the current directory to where the script lives.
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

# Function to assign role with error handling
assign_role_to_current_user() {
    local role_name=$1
    local scope=$2
    local scope_name=$3
    
    echo "🎯 Assigning role: $role_name"
    echo "   Scope: $scope_name"
    
    # Check if role assignment already exists
    local existing=$(az role assignment list \
        --assignee $CURRENT_USER_ID \
        --role "$role_name" \
        --scope "$scope" \
        --query length(@) 2>/dev/null)
    
    if [ "$existing" -gt 0 ]; then
        echo "   ℹ️  Role already assigned, skipping"
        return 0
    fi
    
    # Assign the role
    az role assignment create \
        --assignee $CURRENT_USER_ID \
        --role "$role_name" \
        --scope "$scope" \
        --output none
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Successfully assigned"
    else
        echo "   ❌ Failed to assign"
        return 1
    fi
}

####################################################################################

# Check if all required arguments have been set
check_required_arguments

####################################################################################

# Get current user information
echo "🔍 Getting current user information..."
CURRENT_USER_ID=$(az ad signed-in-user show --query id -o tsv)
CURRENT_USER_UPN=$(az ad signed-in-user show --query userPrincipalName -o tsv)
CURRENT_USER_DISPLAY_NAME=$(az ad signed-in-user show --query displayName -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

if [[ -z "$CURRENT_USER_ID" ]]; then
    echo "❌ Error: Could not get current user information. Make sure you're logged in with 'az login'"
    exit 1
fi

echo "📋 Current User Information:"
echo "   Display Name: $CURRENT_USER_DISPLAY_NAME"
echo "   UPN: $CURRENT_USER_UPN"
echo "   Object ID: $CURRENT_USER_ID"
echo "   Subscription: $SUBSCRIPTION_ID"
echo ""

# Get resource information
echo "🏗️  Getting resource information..."
STORAGE_ACCOUNT_ID=$(az storage account show \
    --name $storageAccountName \
    --resource-group $resourceGroupName \
    --query id -o tsv 2>/dev/null)

if [[ -z "$STORAGE_ACCOUNT_ID" ]]; then
    echo "❌ Error: Could not find storage account '$storageAccountName' in resource group '$resourceGroupName'"
    exit 1
fi

RESOURCE_GROUP_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$resourceGroupName"
SUBSCRIPTION_SCOPE="/subscriptions/$SUBSCRIPTION_ID"

echo "📦 Resource Information:"
echo "   Storage Account: $storageAccountName"
echo "   Resource Group: $resourceGroupName"
echo "   Storage Account ID: $STORAGE_ACCOUNT_ID"
echo ""

# Assign storage-specific roles
echo "📦 Assigning Storage Roles:"
assign_role_to_current_user "Storage Blob Data Owner" "$STORAGE_ACCOUNT_ID" "Storage Account"
assign_role_to_current_user "Storage Queue Data Contributor" "$STORAGE_ACCOUNT_ID" "Storage Account" 
assign_role_to_current_user "Storage Table Data Contributor" "$STORAGE_ACCOUNT_ID" "Storage Account"

echo ""
echo "🔧 Assigning Resource Group Roles:"
assign_role_to_current_user "Monitoring Metrics Publisher" "$RESOURCE_GROUP_SCOPE" "Resource Group"

# Optional: Assign Contributor role (commented out by default - uncomment if needed)
# echo "⚠️  Assigning Contributor role (broad permissions):"
# assign_role_to_current_user "Contributor" "$RESOURCE_GROUP_SCOPE" "Resource Group"

echo ""
echo "🎉 Role assignment process completed!"

# Show final role assignments for this resource group
echo ""
echo "📋 Current Role Assignments for this Resource Group:"
az role assignment list \
    --assignee $CURRENT_USER_ID \
    --scope "$RESOURCE_GROUP_SCOPE" \
    --query "[].{Role:roleDefinitionName, Scope:scope}" \
    --output table

echo ""
echo "📋 Current Role Assignments for the Storage Account:"
az role assignment list \
    --assignee $CURRENT_USER_ID \
    --scope "$STORAGE_ACCOUNT_ID" \
    --query "[].{Role:roleDefinitionName, Scope:scope}" \
    --output table

echo ""
echo "✅ All done! You now have the necessary permissions for Azure Functions development."
echo ""
echo "🔧 Next Steps:"
echo "   1. Test local development: npm start"
echo "   2. Deploy functions: func azure functionapp publish <function-app-name>"
echo "   3. Test storage access: az storage blob list --account-name $storageAccountName --container-name <container> --auth-mode login"