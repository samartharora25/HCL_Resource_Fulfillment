import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { parseSheetData } from '../parsing';

describe('parsing and validation', () => {
  it('correctly parses the fixture according to spec', () => {
    const fixturePath = path.join(__dirname, 'fixture.csv');
    // Using string to trigger standard parsing. 
    // SheetJS reads CSVs as single-sheet workbooks.
    const fileData = fs.readFileSync(fixturePath, 'utf8');
    const workbook = XLSX.read(fileData, { type: 'string', cellDates: true });
    
    const sheetName = workbook.SheetNames[0];
    const result = parseSheetData(workbook, sheetName);
    
    // 11 data rows in (ignoring header)
    expect(result.totalRows).toBe(11);
    
    const { validData, errors } = result.validationResult;
    
    // We expect I7, I8, I9, I11 to have errors
    expect(errors.length).toBe(4);
    
    // I7: duplicate ID (due to Requisition No being mapped to ID and it being a duplicate)
    const errI7 = errors.find(e => e.row === 8); // I7 is 8th data row (row ref 8)
    expect(errI7).toBeDefined();
    expect(errI7?.reasons).toContain('Duplicate ID / Requisition No');
    
    // I8: missing skill
    const errI8 = errors.find(e => e.row === 9);
    expect(errI8).toBeDefined();
    expect(errI8?.reasons).toContain('Missing skill');
    
    // I9: Invalid hiring type
    const errI9 = errors.find(e => e.row === 10);
    expect(errI9).toBeDefined();
    expect(errI9?.reasons).toContain('Invalid hiring type: Contractor. Must be Internal or External.');
    
    // I11: invalid skill format (only digits)
    const errI11 = errors.find(e => e.row === 12);
    expect(errI11).toBeDefined();
    expect(errI11?.reasons).toContain('Invalid skill name format');
    
    // Check I6: no joining date, excluded from lead-time but valid
    const validI6 = validData.find(v => v.skillRaw === 'Google Cloud Platform (GCP)');
    expect(validI6).toBeDefined();
    expect(validI6?.fulfilledDate).toBeNull();
    expect(validI6?.leadTimeDays).toBeNull();
    expect(validI6?.hiringType).toBe('External');
    
    // Total valid should be 7
    expect(validData.length).toBe(7);
    
    // I1 lead time calculation (06-24 to 09-02 -> 70 days)
    const validI1 = validData.find(v => v.skillRaw === 'Pega');
    expect(validI1?.leadTimeDays).toBe(70);
  });
});
