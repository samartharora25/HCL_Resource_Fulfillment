import { FulfillmentRecord, ValidationResult, ValidationError } from './types';
import { isValid, isBefore, startOfDay } from 'date-fns';

/**
 * Validates a dataset of parsed rows, returning valid records and errors.
 */
export function validateData(
  parsedRows: Partial<FulfillmentRecord>[]
): ValidationResult {
  const validData: FulfillmentRecord[] = [];
  const errors: ValidationError[] = [];
  
  // Track seen IDs for duplication checks
  const seenIds = new Set<string>();
  
  for (const row of parsedRows) {
    const rowNum = row.sourceRowRef || 0;
    const rowErrors: string[] = [];
    
    // 1. Mandatory Fields
    if (!row.id) rowErrors.push('Missing unique ID');
    if (!row.raisedDate) rowErrors.push('Missing raised date');
    if (!row.hiringType) rowErrors.push('Missing hiring type');
    if (!row.skillRaw) {
      rowErrors.push('Missing skill');
    } else {
      const cleanSkill = row.skillRaw.trim();
      if (!/[a-zA-Z]/.test(cleanSkill)) {
        rowErrors.push('Invalid skill name format');
      }
    }
    
    // 2. Duplicate ID
    if (row.id) {
      if (seenIds.has(row.id)) {
        rowErrors.push('Duplicate ID / Requisition No');
      } else {
        seenIds.add(row.id);
      }
    }
    
    // 3. Invalid / unparseable dates
    if (row.raisedDate && !isValid(row.raisedDate)) {
      rowErrors.push('Invalid raised date');
    }
    if (row.fulfilledDate && !isValid(row.fulfilledDate)) {
      rowErrors.push('Invalid fulfilled date');
    }
    
    // 4. Fulfilled Date earlier than Raised Date
    if (
      row.raisedDate && isValid(row.raisedDate) &&
      row.fulfilledDate && isValid(row.fulfilledDate)
    ) {
      if (isBefore(startOfDay(row.fulfilledDate), startOfDay(row.raisedDate))) {
        rowErrors.push('Fulfilled date is earlier than raised date');
      }
    }
    
    // 5. Hiring Type constraints
    if (row.hiringType && row.hiringType !== 'Internal' && row.hiringType !== 'External') {
      rowErrors.push(`Invalid hiring type: ${row.hiringType}. Must be Internal or External.`);
    }
    
    if (rowErrors.length > 0) {
      errors.push({ 
        row: rowNum, 
        reasons: rowErrors,
        rowData: {
          id: row.id || undefined,
          raisedDate: row.raisedDate && isValid(row.raisedDate) ? row.raisedDate.toISOString().split('T')[0] : undefined,
          fulfilledDate: row.fulfilledDate && isValid(row.fulfilledDate) ? row.fulfilledDate.toISOString().split('T')[0] : undefined,
          hiringType: row.hiringType || undefined,
          skillRaw: row.skillRaw || undefined,
          department: row.department || undefined,
          location: row.location || undefined,
          band: row.band || undefined
        }
      });
    } else {
      validData.push(row as FulfillmentRecord);
    }
  }
  
  return { validData, errors };
}
