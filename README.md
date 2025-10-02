# Durable Functions VM Creation Orchestrator

This project creates Azure VMs in parallel from snapshots using Durable Functions (TypeScript), with batching, retry logic, and Azure Monitor integration.


## Setup on Azure

1. Open a console, login with `az login` and set your desired subscrition with `az account set -s 11111111-2222-3333-4444-555555555555`.
2. Change to the `scripts` directory.
3. Copy file `template.env` to a new file `.env` and customize it with your settings.
4. Run `create-azure-environment.sh` to set up the Azure environment.
5. Assign the `Contributor` role to the created Function App Managed Identity in all the **source resource groups** that might contain snapshots to be restored, as well as, in all **target resource groups** to where the virtual machines will be restored.
6. Run the `permissions-az-login.sh` script to give permissions to the logged-in user in the newly created storage account (only if you need to browse data).
7. Deploy Functions App with:

    ```bash
    npm run prestart
    func azure functionapp publish <your-function-name> --typescript
    ```

    For this type of deployment you need to make sure the Storage Account public network access is enabled.


## Setup Locally

1. Fill in `local.settings.json` with your Azure and Log Analytics details.
2. Run `npm install`.
3. Run `npm run build`.
4. Start locally with `npm start` or deploy to Azure Functions.

resource group contributor sources + target



## Testing

You can fire a ecovery batch using the provided

send-queue-message.sh




## Monitoring

All VM creation results are logged to Azure Monitor (Log Analytics). Use a workbook to visualize progress and failures.

## TODO

- Local dev: az login user must be storage blob owner + queue data contributor + table data contributor on the storage account used by function app

- change recovery cli
- update documentation
- deal with data disks



## Error Handling

Best Practices for Activity Error Handling
1. Classify Errors by Type
There are three main categories of errors to handle differently:

Transient Errors (Should Retry)
Network timeouts
Temporary Azure service unavailability
Rate limiting (429 errors)
SQL connection timeouts
Permanent Errors (Should NOT Retry)
Invalid input data
Resource not found (404)
Authentication/authorization failures (401/403)
Business logic violations
Fatal Errors (Should Fail Fast)
Configuration errors
Critical system failures
Unrecoverable data corruption

