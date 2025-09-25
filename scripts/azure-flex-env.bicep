// Creates: Storage Account (with queues), App Service Plan, Function App (system assigned identity),
// Log Analytics Workspace, Data Collection Endpoint (DCE) and Data Collection Rule (DCR).
// Role assignments (Storage Blob Data Owner, Storage Queue Data Contributor, Monitoring Metrics Publisher, Contributor).
// Azure Monitor Workbook (from JSON file).

// Parameters
param prefix string = 'smcp' // prefix for resource names

param storageAccountName string = '${prefix}snaprecsa01'
param funcAppName string = '${prefix}snaprec-fa01'
param location string = resourceGroup().location
param appInsightsName string = '${prefix}snaprec-ai01'
param workspaceName string = '${prefix}snapmng-law01'
param tableName string = 'SnapshotsRecovery_CL'
param dcrName string = '${prefix}snaprec-dcr01'
param dceName string = '${prefix}snaprec-dce01'
param workbookJson string

@minLength(3)
@maxLength(24)
param saName string = toLower(storageAccountName)

// Variables
var deploymentStorageContainerName = 'deployment'

var queuesToCreate = [
  'recovery-jobs'
  'recovery-control'
]

// Storage Account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: saName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    publicNetworkAccess: 'Enabled'
  }

  resource blobServices 'blobServices' = {
    name: 'default'
    properties: {
      deleteRetentionPolicy: {}
    }

    resource deploymentContainer 'containers' = {
      name: deploymentStorageContainerName
      properties: {
        publicAccess: 'None'
      }
    }
  }

}


// Create the default queue service (required parent)
resource storageQueueService 'Microsoft.Storage/storageAccounts/queueServices@2021-09-01' = {
  name: 'default'
  parent: storageAccount
  properties: {}
}

// Create queues
resource queues 'Microsoft.Storage/storageAccounts/queueServices/queues@2021-09-01' = [for q in queuesToCreate: {
  name: q
  parent: storageQueueService
  properties: {}
}]

// App Service plan (Flex Consumption)
resource hostingPlan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: '${funcAppName}-plan'
  location: location
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true // Enables Linux
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2024-11-01' = {
  name: funcAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    functionAppConfig:{
      runtime:{
        name: 'node'
        version: '20'
      }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${deploymentStorageContainerName}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 100
        instanceMemoryMB: 2048
      }
    }
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage__accountname'
          value: storageAccount.name
        }
      ]
    }
  }

}

// Role Assignments for storage
// Check https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/storage
resource blobRoleAssignment 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, storageAccount.id, 'Storage Blob Data Owner')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b') // Storage Blob Data Owner
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource queueRoleAssignment 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, storageAccount.id, 'Storage Queue Data Contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88') // Storage Queue Data Contributor

    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource tableRoleAssignment 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, storageAccount.id, 'Storage Table Data Contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3') // Storage Table Data Contributor

    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2021-06-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Application Insights for Function App monitoring
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
    RetentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// Log analytics ingestion
resource customTable 'Microsoft.OperationalInsights/workspaces/tables@2022-10-01' = {
  parent: logAnalytics
  name: tableName
  properties: {
    schema: {
      name: tableName
      columns: [
        {
          name: 'TimeGenerated'
          type: 'datetime'
        }
        {
          name: 'jobId'
          type: 'string'
        }
        {
          name: 'jobOperation'
          type: 'string'
        }
        {
          name: 'jobStatus'
          type: 'string'
        }
        {
          name: 'jobType'
          type: 'string'
        }
        {
          name: 'message'
          type: 'string'
        }
        {
          name: 'snapshotId'
          type: 'string'
        }
        {
          name: 'snapshotName'
          type: 'string'
        }
        {
          name: 'vmName'
          type: 'string'
        }
        {
          name: 'vmSize'
          type: 'string'
        }
        {
          name: 'diskSku'
          type: 'string'
        }
        {
          name: 'diskProfile'
          type: 'string'
        }
        {
          name: 'vmId'
          type: 'string'
        }
        {
          name: 'ipAddress'
          type: 'string'
        }
      ]
    }
    plan: 'Analytics'
    totalRetentionInDays: 30
  }
}

// Data Collection Endpoint
resource dce 'Microsoft.Insights/dataCollectionEndpoints@2021-09-01-preview' = {
  name: dceName
  location: location
  properties: {}
}

resource dcr 'Microsoft.Insights/dataCollectionRules@2021-09-01-preview' = {
  name: dcrName
  location: location
  properties: {
    dataCollectionEndpointId: dce.id
    streamDeclarations: {
        'Custom-${tableName}-source': {
            columns: [
                {
                  name: 'TimeGenerated'
                  type: 'datetime'
                }
                {
                  name: 'jobId'
                  type: 'string'
                }
                {
                  name: 'jobOperation'
                  type: 'string'
                }
                {
                  name: 'jobStatus'
                  type: 'string'
                }
                {
                  name: 'jobType'
                  type: 'string'
                }
                {
                  name: 'message'
                  type: 'string'
                }
                {
                  name: 'snapshotId'
                  type: 'string'
                }
                {
                  name: 'snapshotName'
                  type: 'string'
                }
                {
                  name: 'vmName'
                  type: 'string'
                }
                {
                  name: 'vmSize'
                  type: 'string'
                }
                {
                  name: 'diskSku'
                  type: 'string'
                }
                {
                  name: 'diskProfile'
                  type: 'string'
                }
                {
                  name: 'vmId'
                  type: 'string'
                }
                {
                  name: 'ipAddress'
                  type: 'string'
                }
            ]
        }
    }
    destinations: {
      logAnalytics: [
        {
          name: 'laDest'
          workspaceResourceId: logAnalytics.id
        }
      ]
    }
    dataFlows: [
      {
        streams: [
          'Custom-${tableName}-source'
        ]
        destinations: [
          'laDest'
        ]
        transformKql: 'source | project TimeGenerated, jobId, jobOperation, jobStatus, jobType, message, snapshotId, snapshotName, vmName, vmSize, diskSku, diskProfile, vmId, ipAddress'
        outputStream: 'Custom-${tableName}'
      }
    ]
  }
}

// Role Assignments for log analytics
resource monitoringMetricsPublisherRoleAssignment 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, resourceGroup().id, 'Monitoring Metrics Publisher')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb') // Monitoring Metrics Publisher
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource contributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, resourceGroup().id, 'Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c') // Contributor role
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function App settings
resource appSettings 'Microsoft.Web/sites/config@2022-03-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    AzureWebJobsStorage__accountname: storageAccount.name
    APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString
    APPINSIGHTS_INSTRUMENTATIONKEY: applicationInsights.properties.InstrumentationKey
    LOGS_INGESTION_ENDPOINT: dce.properties.logsIngestion.endpoint
    LOGS_INGESTION_RULE_ID: dcr.properties.immutableId
    LOGS_INGESTION_STREAM_NAME: 'Custom-${tableName}-source'
    SNAP_RECOVERY_BATCH_SIZE: '20'
    SNAP_RECOVERY_DELAY_BETWEEN_BATCHES: '10'
  }
}

// Azure Monitor Workbook
resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: guid(resourceGroup().id, 'AzureSnapshotsRecoveryInsightsWorkbook')
  location: resourceGroup().location
  kind: 'shared'
  properties: {
    displayName: 'Azure Snapshots Recovery Insights'
    category: 'workbook'
    sourceId: resourceGroup().id
    serializedData: workbookJson
    version: '1.0'
  }
}

// Outputs
output storageAccountId string = storageAccount.id
output functionAppIdentityPrincipalId string = functionApp.identity.principalId
output functionAppName string = functionApp.name
output logAnalyticsWorkspaceName string = logAnalytics.name
output applicationInsightsName string = applicationInsights.name
output applicationInsightsInstrumentationKey string = applicationInsights.properties.InstrumentationKey
output applicationInsightsConnectionString string = applicationInsights.properties.ConnectionString
