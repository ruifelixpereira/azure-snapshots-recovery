# Durable Functions VM Creation Orchestrator

This project creates Azure VMs in parallel from snapshots using Durable Functions (TypeScript), with batching, retry logic, and Azure Monitor integration.

## Setup

1. Fill in `local.settings.json` with your Azure and Log Analytics details.
2. Run `npm install`.
3. Run `npm run build`.
4. Start locally with `npm start` or deploy to Azure Functions.

## Monitoring

All VM creation results are logged to Azure Monitor (Log Analytics). Use a workbook to visualize progress and failures.

## TODO

- Local dev: az login user must be storage blob owner + queue data contributor + table data contributor on the storage account used by function app

- restore single vm or vm group from the last snapshots
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

