#!/bin/bash

# Setup RBAC permissions for Azure Storage Queue access using Entra ID
# Usage: ./setup-queue-rbac.sh

set -e

# Configuration
STORAGE_ACCOUNT_NAME="your-storage-account"     # Update this
RESOURCE_GROUP_NAME="your-resource-group"       # Update this
SUBSCRIPTION_ID="your-subscription-id"          # Update this
FUNCTION_APP_NAME="your-function-app"           # Update this (optional)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Azure Storage Queue RBAC Setup${NC}"
echo "=================================="

# Check if logged in
if ! az account show >/dev/null 2>&1; then
    echo -e "${RED}❌ Not logged in to Azure CLI. Please run 'az login' first.${NC}"
    exit 1
fi

CURRENT_USER=$(az account show --query "user.name" -o tsv)
echo -e "${GREEN}👤 Current user: $CURRENT_USER${NC}"

# Validate configuration
if [[ "$STORAGE_ACCOUNT_NAME" == "your-storage-account" ]]; then
    echo -e "${RED}❌ Please update STORAGE_ACCOUNT_NAME in this script${NC}"
    exit 1
fi

if [[ "$RESOURCE_GROUP_NAME" == "your-resource-group" ]]; then
    echo -e "${RED}❌ Please update RESOURCE_GROUP_NAME in this script${NC}"
    exit 1
fi

if [[ "$SUBSCRIPTION_ID" == "your-subscription-id" ]]; then
    echo -e "${RED}❌ Please update SUBSCRIPTION_ID in this script${NC}"
    exit 1
fi

# Set subscription context
echo -e "${BLUE}🔄 Setting subscription context...${NC}"
az account set --subscription "$SUBSCRIPTION_ID"

# Build storage account scope
STORAGE_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP_NAME/providers/Microsoft.Storage/storageAccounts/$STORAGE_ACCOUNT_NAME"

echo -e "${BLUE}📦 Storage Account: $STORAGE_ACCOUNT_NAME${NC}"
echo -e "${BLUE}📁 Resource Group: $RESOURCE_GROUP_NAME${NC}"
echo -e "${BLUE}🔗 Subscription: $SUBSCRIPTION_ID${NC}"

# Check if storage account exists
echo -e "${BLUE}🔍 Checking if storage account exists...${NC}"
if ! az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP_NAME" >/dev/null 2>&1; then
    echo -e "${RED}❌ Storage account '$STORAGE_ACCOUNT_NAME' not found in resource group '$RESOURCE_GROUP_NAME'${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Storage account found${NC}"

# Function to assign role
assign_role() {
    local assignee="$1"
    local role="$2"
    local scope="$3"
    local description="$4"
    
    echo -e "${BLUE}🔑 Assigning '$role' role to $description...${NC}"
    
    if az role assignment create \
        --assignee "$assignee" \
        --role "$role" \
        --scope "$scope" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Successfully assigned '$role' role${NC}"
    else
        echo -e "${YELLOW}⚠️  Role assignment may already exist or failed for '$role'${NC}"
    fi
}

# Get current user's object ID
CURRENT_USER_OBJECT_ID=$(az ad signed-in-user show --query "id" -o tsv)

echo ""
echo -e "${BLUE}👤 Assigning roles to current user ($CURRENT_USER)...${NC}"

# Assign Storage Queue Data Contributor role to current user
assign_role "$CURRENT_USER_OBJECT_ID" "Storage Queue Data Contributor" "$STORAGE_SCOPE" "current user"

# Assign Reader role to current user (if not inherited)
assign_role "$CURRENT_USER_OBJECT_ID" "Reader" "$STORAGE_SCOPE" "current user"

# Function App setup (optional)
if [[ "$FUNCTION_APP_NAME" != "your-function-app" ]]; then
    echo ""
    echo -e "${BLUE}🔧 Setting up Function App permissions...${NC}"
    
    # Check if Function App exists
    if az functionapp show --name "$FUNCTION_APP_NAME" --resource-group "$RESOURCE_GROUP_NAME" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Function App '$FUNCTION_APP_NAME' found${NC}"
        
        # Enable system-assigned managed identity
        echo -e "${BLUE}🆔 Enabling system-assigned managed identity...${NC}"
        az functionapp identity assign \
            --name "$FUNCTION_APP_NAME" \
            --resource-group "$RESOURCE_GROUP_NAME" >/dev/null
        
        # Get Function App's managed identity object ID
        FUNCTION_IDENTITY_ID=$(az functionapp identity show \
            --name "$FUNCTION_APP_NAME" \
            --resource-group "$RESOURCE_GROUP_NAME" \
            --query "principalId" -o tsv)
        
        if [[ -n "$FUNCTION_IDENTITY_ID" ]]; then
            echo -e "${GREEN}✅ Managed identity enabled: $FUNCTION_IDENTITY_ID${NC}"
            
            # Assign roles to Function App managed identity
            assign_role "$FUNCTION_IDENTITY_ID" "Storage Queue Data Contributor" "$STORAGE_SCOPE" "Function App managed identity"
            assign_role "$FUNCTION_IDENTITY_ID" "Reader" "$STORAGE_SCOPE" "Function App managed identity"
        else
            echo -e "${RED}❌ Failed to get Function App managed identity${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Function App '$FUNCTION_APP_NAME' not found${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🎉 RBAC setup completed!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo "1. Test queue message sending with: ./send-queue-message.sh"
echo "2. Monitor Function App logs for queue message processing"
echo "3. Verify queue creation in Azure Storage Explorer"
echo ""
echo -e "${BLUE}🔍 Verify permissions:${NC}"
echo "az role assignment list --assignee $CURRENT_USER_OBJECT_ID --scope $STORAGE_SCOPE"
echo ""
echo -e "${YELLOW}💡 Note: Role assignments may take a few minutes to propagate${NC}"