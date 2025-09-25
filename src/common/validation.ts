// Type validation utilities for Azure Functions
// This module provides runtime type checking for TypeScript interfaces

import { BatchOrchestratorInput } from './interfaces';

/**
 * Type guard to check if an object is a valid BatchOrchestratorInput
 * @param obj The object to validate
 * @returns True if the object matches BatchOrchestratorInput interface
 */
export function isBatchOrchestratorInput(obj: any): obj is BatchOrchestratorInput {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.targetSubnetId === 'string' &&
    obj.targetSubnetId.length > 0 &&
    typeof obj.targetResourceGroup === 'string' &&
    obj.targetResourceGroup.length > 0 &&
    (obj.filters === undefined || (typeof obj.filters === 'object' && obj.filters !== null))
  );
}

/**
 * Validates and returns a BatchOrchestratorInput, throwing an error if invalid
 * @param obj The object to validate
 * @returns Validated BatchOrchestratorInput
 * @throws Error if validation fails
 */
export function validateBatchOrchestratorInput(obj: any): BatchOrchestratorInput {
  if (!isBatchOrchestratorInput(obj)) {
    const errors: string[] = [];
    
    if (typeof obj !== 'object' || obj === null) {
      errors.push('Input must be an object');
    } else {
      if (typeof obj.targetSubnetId !== 'string' || obj.targetSubnetId.length === 0) {
        errors.push('targetSubnetId must be a non-empty string');
      }
      if (typeof obj.targetResourceGroup !== 'string' || obj.targetResourceGroup.length === 0) {
        errors.push('targetResourceGroup must be a non-empty string');
      }
      if (obj.filters !== undefined && (typeof obj.filters !== 'object' || obj.filters === null)) {
        errors.push('filters must be an object if provided');
      }
    }
    
    throw new Error(`Invalid BatchOrchestratorInput: ${errors.join(', ')}`);
  }
  
  return obj;
}

/**
 * Validates BatchOrchestratorInput with detailed validation including Azure resource ID format
 * @param obj The object to validate
 * @returns Validated BatchOrchestratorInput with additional checks
 * @throws Error if validation fails
 */
export function validateBatchOrchestratorInputStrict(obj: any): BatchOrchestratorInput {
  // First run basic validation
  const input = validateBatchOrchestratorInput(obj);
  
  // Additional strict validations
  const errors: string[] = [];
  
  // Validate subnet ID format (should be a full Azure resource ID)
  const subnetIdPattern = /^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[^\/]+\/providers\/Microsoft\.Network\/virtualNetworks\/[^\/]+\/subnets\/[^\/]+$/i;
  if (!subnetIdPattern.test(input.targetSubnetId)) {
    errors.push('targetSubnetId must be a valid Azure subnet resource ID format');
  }
  
  // Validate resource group name format
  const resourceGroupPattern = /^[a-zA-Z0-9._()-]+$/;
  if (!resourceGroupPattern.test(input.targetResourceGroup)) {
    errors.push('targetResourceGroup contains invalid characters');
  }
  
  if (errors.length > 0) {
    throw new Error(`Strict validation failed: ${errors.join(', ')}`);
  }
  
  return input;
}

/**
 * Safe parsing of JSON with type validation
 * @param jsonString JSON string to parse
 * @param validator Validation function to use
 * @returns Parsed and validated object
 * @throws Error if parsing or validation fails
 */
export function parseAndValidate<T>(
  jsonString: string, 
  validator: (obj: any) => T
): T {
  try {
    const parsed = JSON.parse(jsonString);
    return validator(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
    throw error; // Re-throw validation errors
  }
}

/**
 * Creates a default BatchOrchestratorInput with placeholder values
 * @returns Default BatchOrchestratorInput object
 */
export function createDefaultBatchOrchestratorInput(): BatchOrchestratorInput {
  return {
    targetSubnetId: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example-rg/providers/Microsoft.Network/virtualNetworks/example-vnet/subnets/example-subnet',
    targetResourceGroup: 'example-rg',
    vmFilter: [
      { vm: "vm-01"  }, 
      { vm: "vm-02"  }
    ]
  };
}

/**
 * Type guard for checking if an object has all required string properties
 * @param obj Object to check
 * @param requiredStringProps Array of property names that must be non-empty strings
 * @returns True if all required properties exist and are non-empty strings
 */
export function hasRequiredStringProperties(obj: any, requiredStringProps: string[]): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  return requiredStringProps.every(prop => 
    typeof obj[prop] === 'string' && obj[prop].length > 0
  );
}

/**
 * Sanitizes and validates input by removing unexpected properties
 * @param input Raw input object
 * @returns Clean BatchOrchestratorInput object
 */
export function sanitizeBatchOrchestratorInput(input: any): BatchOrchestratorInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Input must be an object');
  }

  const sanitized: BatchOrchestratorInput = {
    targetSubnetId: String(input.targetSubnetId || '').trim(),
    targetResourceGroup: String(input.targetResourceGroup || '').trim(),
  };

  // Only include filters if it's a valid object
  if (input.vmFilter && Array.isArray(input.vmFilter)) {
    sanitized.vmFilter = { ...input.vmFilter };
  }

  // Validate the sanitized input
  return validateBatchOrchestratorInput(sanitized);
}