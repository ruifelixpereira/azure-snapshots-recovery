// Service Principal Setup for Local Development
// This Bicep template creates role assignments for a service principal
// The service principal itself must be created via Azure CLI/PowerShell

@description('The prefix for resource names')
param prefix string = 'smcp'

@description('The name of the storage account')
param storageAccountName string = '${prefix}snaprecsa01'

@description('The name of the data collection rule')
param dcrName string = '${prefix}snaprec-dcr01'

@description('The name of the data collection endpoint')
param dceName string = '${prefix}snaprec-dce01'

@description('The object ID (principal ID) of the service principal')
param servicePrincipalObjectId string

@description('The application (client) ID of the service principal')
param servicePrincipalClientId string

@description('The display name for the service principal')
param servicePrincipalDisplayName string = 'local-dev-service-principal'

// Reference existing resources
resource existingStorageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource existingDcr 'Microsoft.Insights/dataCollectionRules@2021-09-01-preview' existing = {
  name: dcrName
}

resource existingDce 'Microsoft.Insights/dataCollectionEndpoints@2021-09-01-preview' existing = {
  name: dceName
}

// Storage Account Role Assignments
resource storageAccountBlobDataOwnerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(servicePrincipalObjectId, existingStorageAccount.id, 'Storage Blob Data Owner')
  scope: existingStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b') // Storage Blob Data Owner
    principalId: servicePrincipalObjectId
    principalType: 'ServicePrincipal'
    description: 'Allows service principal to manage storage blobs for local development'
  }
}

resource storageAccountQueueDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(servicePrincipalObjectId, existingStorageAccount.id, 'Storage Queue Data Contributor')
  scope: existingStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88') // Storage Queue Data Contributor
    principalId: servicePrincipalObjectId
    principalType: 'ServicePrincipal'
    description: 'Allows service principal to manage storage queues for local development'
  }
}

resource storageAccountTableDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(servicePrincipalObjectId, existingStorageAccount.id, 'Storage Table Data Contributor')
  scope: existingStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3') // Storage Table Data Contributor
    principalId: servicePrincipalObjectId
    principalType: 'ServicePrincipal'
    description: 'Allows service principal to manage storage tables for local development'
  }
}

// Resource Group Level Role Assignments
resource monitoringMetricsPublisherRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(servicePrincipalObjectId, resourceGroup().id, 'Monitoring Metrics Publisher')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb') // Monitoring Metrics Publisher
    principalId: servicePrincipalObjectId
    principalType: 'ServicePrincipal'
    description: 'Allows service principal to publish metrics for local development'
  }
}

/*
resource contributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(servicePrincipalObjectId, resourceGroup().id, 'Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c') // Contributor
    principalId: servicePrincipalObjectId
    principalType: 'ServicePrincipal'
    description: 'Allows service principal to manage resources for local development'
  }
}
*/

// Outputs
output servicePrincipalClientId string = servicePrincipalClientId
output servicePrincipalObjectId string = servicePrincipalObjectId
output servicePrincipalDisplayName string = servicePrincipalDisplayName
output storageAccountName string = existingStorageAccount.name
output logsIngestionEndpoint string = existingDce.properties.logsIngestion.endpoint
output logsIngestionRuleId string = existingDcr.properties.immutableId
output logsIngestionStreamName string = 'Custom-SnapshotsRecovery_CL-source'

// Generate local.settings.json structure
output localSettingsJson object = {
  IsEncrypted: false
  Values: {
    FUNCTIONS_WORKER_RUNTIME: 'node'
    AzureWebJobsStorage__accountname: existingStorageAccount.name
    AZURE_TENANT_ID: subscription().tenantId
    AZURE_CLIENT_ID: servicePrincipalClientId
    LOGS_INGESTION_ENDPOINT: existingDce.properties.logsIngestion.endpoint
    LOGS_INGESTION_RULE_ID: existingDcr.properties.immutableId
    LOGS_INGESTION_STREAM_NAME: 'Custom-SnapshotsRecovery_CL-source'
    SNAPSHOT_SECONDARY_LOCATION: 'westeurope'
    SNAPSHOT_RETRY_CONTROL_COPY_MINUTES: '15'
    SNAPSHOT_RETRY_CONTROL_PURGE_MINUTES: '15'
    SNAPSHOT_PURGE_PRIMARY_LOCATION_NUMBER_OF_DAYS: '2'
    SNAPSHOT_PURGE_SECONDARY_LOCATION_NUMBER_OF_DAYS: '30'
  }
}

// Summary of permissions granted
output permissionsSummary array = [
  'Storage Blob Data Owner on ${existingStorageAccount.name}'
  'Storage Queue Data Contributor on ${existingStorageAccount.name}'
  'Storage Table Data Contributor on ${existingStorageAccount.name}'
  'Monitoring Metrics Publisher on Resource Group'
  'Contributor on Resource Group'
]
