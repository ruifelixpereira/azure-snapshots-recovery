// Type validation utilities for Azure Functions
// This module provides runtime type checking for TypeScript interfaces

import { BatchOrchestratorInput } from './interfaces';


/**
 * Type guard to check if an object is a valid BatchOrchestratorInput
 * @param obj The object to validate
 * @returns True if the object matches BatchOrchestratorInput interface
 */
export function isBatchOrchestratorInput(obj: any): obj is BatchOrchestratorInput {
    return obj &&
           Array.isArray(obj.targetSubnetIds) &&
           obj.targetSubnetIds.every((id: any) => typeof id === 'string') &&
           typeof obj.targetResourceGroup === 'string' &&
           typeof obj.maxTimeGenerated === 'string' &&
           typeof obj.useOriginalIpAddress === 'boolean' &&
           (obj.vmFilter === undefined || Array.isArray(obj.vmFilter));
}

/**
 * Validates if a string is a valid ISO 8601 date format
 * @param dateString The string to validate
 * @returns True if the string is a valid ISO date
 */
export function isValidISODateString(dateString: string): boolean {
  if (typeof dateString !== 'string' || dateString.length === 0) {
    return false;
  }
  
  // Check basic ISO 8601 format pattern
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDatePattern.test(dateString)) {
    return false;
  }
  
  // Try to parse the date and check if it's valid
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().startsWith(dateString.substring(0, 19));
}

/**
 * Parses an ISO date string to a Date object
 * @param dateString ISO 8601 date string
 * @returns Date object
 * @throws Error if the string is not a valid ISO date
 */
export function parseISODateString(dateString: string): Date {
  if (!isValidISODateString(dateString)) {
    throw new Error(`Invalid ISO date string: ${dateString}. Expected format: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ`);
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot parse date string: ${dateString}`);
  }
  
  return date;
}

/**
 * Validates maxTimeGenerated field as an ISO string or Date object and returns ISO string
 * @param value ISO string or Date object (required)
 * @returns ISO string
 * @throws Error if the value is invalid or missing
 */
export function validateMaxTimeGenerated(value: any): string {
    if (typeof value === 'string') {
        if (!isValidISODateString(value)) {
            throw new Error(`Invalid maxTimeGenerated: Invalid ISO date string: ${value}. Expected format: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ`);
        }
        
        const date = new Date(value);
        if (isNaN(date.getTime())) {
            throw new Error(`Cannot parse date string: ${value}`);
        }
        
        return value; // Return the validated ISO string
    }
    
    if (value instanceof Date) {
        return value.toISOString(); // Convert Date to ISO string
    }
    
    throw new Error(`Invalid maxTimeGenerated type: ${typeof value}. Expected ISO string or Date object.`);
}

/**
 * Validates useOriginalIpAddress field as a boolean
 * @param value Boolean value or string that can be converted to boolean
 * @returns Boolean value
 * @throws Error if the value is invalid
 */
export function validateUseOriginalIpAddress(value: any): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    
    if (typeof value === 'string') {
        const lowerValue = value.toLowerCase().trim();
        if (lowerValue === 'true') {
            return true;
        } else if (lowerValue === 'false') {
            return false;
        } else {
            throw new Error(`Invalid useOriginalIpAddress string: ${value}. Expected 'true' or 'false'.`);
        }
    }
    
    throw new Error(`Invalid useOriginalIpAddress type: ${typeof value}. Expected boolean or string 'true'/'false'.`);
}

/**
 * Validates and returns a BatchOrchestratorInput, throwing an error if invalid
 * @param obj The object to validate
 * @returns Validated BatchOrchestratorInput with normalized Date objects
 * @throws Error if validation fails
 */
export function validateBatchOrchestratorInput(obj: any): BatchOrchestratorInput {
  if (!isBatchOrchestratorInput(obj)) {
    const errors: string[] = [];
    
    if (typeof obj !== 'object' || obj === null) {
      errors.push('Input must be an object');
    } else {
      // Validate targetSubnetIds as array
      if (!obj.targetSubnetIds) {
        errors.push('targetSubnetIds is required');
      } else if (!Array.isArray(obj.targetSubnetIds)) {
        errors.push('targetSubnetIds must be an array');
      } else if (obj.targetSubnetIds.length === 0) {
        errors.push('targetSubnetIds array cannot be empty');
      } else {
        // Validate each subnet ID in the array
        obj.targetSubnetIds.forEach((subnetId: any, index: number) => {
          if (typeof subnetId !== 'string') {
            errors.push(`targetSubnetIds[${index}] must be a string`);
          } else if (!subnetId.trim()) {
            errors.push(`targetSubnetIds[${index}] cannot be empty`);
          }
        });
      }
      
      if (typeof obj.targetResourceGroup !== 'string' || obj.targetResourceGroup.length === 0) {
        errors.push('targetResourceGroup must be a non-empty string');
      }
      if (obj.maxTimeGenerated === undefined || obj.maxTimeGenerated === null) {
        errors.push('maxTimeGenerated is required');
      } else if (typeof obj.maxTimeGenerated !== 'string') {
        errors.push('maxTimeGenerated must be an ISO string');
      }
      
      if (obj.useOriginalIpAddress === undefined || obj.useOriginalIpAddress === null) {
        errors.push('useOriginalIpAddress is required');
      } else if (typeof obj.useOriginalIpAddress !== 'boolean') {
        errors.push('useOriginalIpAddress must be a boolean (true or false)');
      }
      
      if (obj.vmFilter !== undefined && !Array.isArray(obj.vmFilter)) {
        errors.push('vmFilter must be an array if provided');
      }
    }
    
    throw new Error(`Invalid BatchOrchestratorInput: ${errors.join(', ')}`);
  }
  
  // Validate the input with subnet ID array
  const validated: BatchOrchestratorInput = {
    targetSubnetIds: obj.targetSubnetIds,
    targetResourceGroup: obj.targetResourceGroup,
    maxTimeGenerated: validateMaxTimeGenerated(obj.maxTimeGenerated),
    useOriginalIpAddress: obj.useOriginalIpAddress,
    vmFilter: obj.vmFilter
  };
  
  return validated;
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
  
  // Validate subnet ID format for each subnet in the array
  const subnetIdPattern = /^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[^\/]+\/providers\/Microsoft\.Network\/virtualNetworks\/[^\/]+\/subnets\/[^\/]+$/i;
  input.targetSubnetIds.forEach((subnetId, index) => {
    if (!subnetIdPattern.test(subnetId)) {
      errors.push(`targetSubnetIds[${index}] must be a valid Azure subnet resource ID format`);
    }
  });
  
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
    targetSubnetIds: ['/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example-rg/providers/Microsoft.Network/virtualNetworks/example-vnet/subnets/example-subnet'],
    targetResourceGroup: 'example-rg',
    maxTimeGenerated: new Date().toISOString(), // Current datetime as ISO string
    useOriginalIpAddress: false, // Default to false for dynamic IP allocation
    vmFilter: ["vm-01", "vm-02"]
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
 * @returns Clean BatchOrchestratorInput object with normalized dates
 */
export function sanitizeBatchOrchestratorInput(input: any): BatchOrchestratorInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Input must be an object');
  }

  // Check if maxTimeGenerated is provided
  if (input.maxTimeGenerated === undefined || input.maxTimeGenerated === null) {
    throw new Error('maxTimeGenerated is required');
  }
  
  // Validate maxTimeGenerated
  let validatedMaxTime: string;
  try {
    validatedMaxTime = validateMaxTimeGenerated(input.maxTimeGenerated);
  } catch (error) {
    throw new Error(`Invalid maxTimeGenerated: ${error.message}`);
  }

  const sanitized: BatchOrchestratorInput = {
    targetSubnetIds: Array.isArray(input.targetSubnetIds) 
      ? input.targetSubnetIds.map((id: string) => String(id || '').trim())
      : Array.isArray(input.targetSubnetId)
        ? input.targetSubnetId.map((id: string) => String(id || '').trim())
        : [String(input.targetSubnetId || input.targetSubnetIds || '').trim()], // Handle both old and new property names
    targetResourceGroup: String(input.targetResourceGroup || '').trim(),
    maxTimeGenerated: validatedMaxTime,
    useOriginalIpAddress: Boolean(input.useOriginalIpAddress) // Convert to boolean
  };

  // Only include vmFilter if it's a valid array
  if (input.vmFilter && Array.isArray(input.vmFilter)) {
    sanitized.vmFilter = input.vmFilter;
  }

  // Validate the sanitized input
  return validateBatchOrchestratorInput(sanitized);
}