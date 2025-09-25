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

Local dev: az login user must be storage blob onwer + quque data controbutor + table data contributor on the sotrag accun tused by function app