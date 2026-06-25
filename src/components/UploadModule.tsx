import React, { useState, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { detectDataSheetName, parseSheetData, getSheetHeaders, type ParseResult } from '../lib/parsing';
import { autoMapColumns } from '../lib/mapping';
import { Card, Button, Badge } from './ui';
import { UploadCloud, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

export const UploadModule = forwardRef<{ reset: () => void }, { 
  onDataReady: (data: ParseResult) => void;
  onStatusChange?: (status: 'idle' | 'uploading' | 'success' | 'parsing' | 'column_mapping' | 'sheet_selection' | 'validation' | 'error') => void;
}>(({ onDataReady, onStatusChange }, ref) => {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'parsing' | 'column_mapping' | 'sheet_selection' | 'validation' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // Progress states
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [detectedSheet, setDetectedSheet] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'empty' | 'unsupported' | 'corrupt' | 'empty_sheet' | 'parsing' | 'generic'>('generic');
  
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setFile(null);
      setWorkbook(null);
      setParseResult(null);
      setUploadProgress(0);
      setFileName('');
      setFileSize(0);
      setDetectedSheet(null);
      setErrorType('generic');
      setActiveSheetName('');
      setColumnMapping({});
      setStatus('idle');
    }
  }));

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    // Check extension
    if (!selected.name.match(/\.(xlsx|xls|csv)$/)) {
      setErrorType('unsupported');
      setStatus('error');
      setErrorMessage('Unsupported file format. Please upload a spreadsheet with one of the following extensions: .xlsx, .xls, or .csv.');
      return;
    }

    // Check if empty file
    if (selected.size === 0) {
      setErrorType('empty');
      setStatus('error');
      setErrorMessage('The uploaded file is empty (0 bytes). Please upload a valid CSV or Excel file containing resource fulfillment data.');
      return;
    }
    
    setFile(selected);
    setFileName(selected.name);
    setFileSize(selected.size);
    setUploadProgress(0);
    setStatus('uploading');

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    let progress = 0;
    progressIntervalRef.current = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        progress = 100;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        setUploadProgress(100);

        // Perform reading and parsing after loading progress completes
        setTimeout(() => {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const data = event.target?.result;
              const wb = XLSX.read(data, { type: 'binary', cellDates: true });
              setWorkbook(wb);
              
              const sheet = detectDataSheetName(wb);
              setDetectedSheet(sheet);
              setStatus('success');
            } catch (err) {
              setErrorType('corrupt');
              setStatus('error');
              setErrorMessage('Unable to read spreadsheet contents. The file may be corrupt, password-protected, or not a valid Excel/CSV binary.');
            }
          };
          reader.onerror = () => {
            setErrorType('corrupt');
            setStatus('error');
            setErrorMessage('Failed to read file from disk.');
          };
          reader.readAsBinaryString(selected);
        }, 300); // short visual break before showing success
      } else {
        setUploadProgress(progress);
      }
    }, 150);
  };

  const processSheet = (wb: XLSX.WorkBook, sheetName: string, customMapping?: Record<string, string | null>) => {
    setStatus('parsing');
    // Allow UI to update before heavy parse
    setTimeout(() => {
      try {
        const result = parseSheetData(wb, sheetName, customMapping);
        if (result.totalRows === 0) {
          setErrorType('empty_sheet');
          setStatus('error');
          setErrorMessage('The selected sheet contains no data rows after the header.');
          return;
        }
        setParseResult(result);
        setStatus('validation');
      } catch (err) {
        setErrorType('parsing');
        setStatus('error');
        setErrorMessage('An error occurred while parsing the sheet data.');
      }
    }, 100);
  };

  const downloadErrorCsv = () => {
    if (!parseResult) return;
    const { errors } = parseResult.validationResult;
    let csvContent = "Row Number,Errors,Unique ID,Skill/Role,Hiring Type,Raised Date,Fulfilled Date,Department,Location,Band\n";
    errors.forEach(err => {
      const escapedErrors = `"${err.reasons.join('; ').replace(/"/g, '""')}"`;
      const id = err.rowData?.id ? `"${err.rowData.id.replace(/"/g, '""')}"` : "[Missing]";
      const skill = err.rowData?.skillRaw ? `"${err.rowData.skillRaw.replace(/"/g, '""')}"` : "[Missing]";
      const hiringType = err.rowData?.hiringType ? `"${err.rowData.hiringType.replace(/"/g, '""')}"` : "[Missing]";
      const raisedDate = err.rowData?.raisedDate ? `"${err.rowData.raisedDate}"` : "[Missing]";
      const fulfilledDate = err.rowData?.fulfilledDate ? `"${err.rowData.fulfilledDate}"` : "[Empty/Not Fulfilled]";
      const dept = err.rowData?.department ? `"${err.rowData.department.replace(/"/g, '""')}"` : "";
      const loc = err.rowData?.location ? `"${err.rowData.location.replace(/"/g, '""')}"` : "";
      const band = err.rowData?.band ? `"${err.rowData.band.replace(/"/g, '""')}"` : "";
      
      csvContent += `${err.row},${escapedErrors},${id},${skill},${hiringType},${raisedDate},${fulfilledDate},${dept},${loc},${band}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "validation_errors.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (status === 'uploading') {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto 0 auto' }}>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', 
              backgroundColor: 'var(--hcl-purple-tint-10)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px auto'
            }}>
              <Loader2 size={32} color="var(--hcl-purple)" style={{ animation: 'spin 1.5s linear infinite' }} />
            </div>
            <h2 style={{ marginBottom: '8px' }}>Uploading File</h2>
            <p style={{ color: 'var(--hcl-neutral-400)', maxWidth: '450px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
              Please wait while we upload and process <strong>{fileName}</strong> ({formatFileSize(fileSize)}).
            </p>
            
            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                <span style={{ color: 'var(--hcl-neutral-400)' }}>Progress</span>
                <span style={{ color: 'var(--hcl-purple)' }}>{uploadProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--hcl-purple-tint-20)', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: 'var(--hcl-purple)', borderRadius: '4px', transition: 'width 0.15s ease-out' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>Do not close or refresh this page</span>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto 0 auto' }}>
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', 
              backgroundColor: 'var(--hcl-success-bg)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px auto'
            }}>
              <CheckCircle2 size={32} color="var(--hcl-success-text)" />
            </div>
            <h2 style={{ marginBottom: '8px' }}>Upload Successful!</h2>
            <p style={{ color: 'var(--hcl-neutral-400)', maxWidth: '450px', margin: '0 auto 32px auto', lineHeight: 1.5 }}>
              Your file has been loaded and is ready for data validation.
            </p>

            <div style={{ 
              backgroundColor: 'var(--hcl-neutral-100)', 
              borderRadius: 'var(--radius-md)', 
              padding: '16px 20px', 
              maxWidth: '450px', 
              margin: '0 auto 32px auto',
              textAlign: 'left',
              border: '1px solid var(--hcl-neutral-200)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <FileSpreadsheet size={20} color="var(--hcl-purple)" />
                <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{fileName}</div>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--hcl-neutral-400)', marginLeft: '32px' }}>
                <div>Size: <strong>{formatFileSize(fileSize)}</strong></div>
                {workbook && (
                  <div>Sheets: <strong>{workbook.SheetNames.length}</strong></div>
                )}
              </div>
            </div>

            <Button onClick={() => {
              if (workbook) {
                if (detectedSheet) {
                  const headers = getSheetHeaders(workbook.Sheets[detectedSheet]);
                  const autoMap = autoMapColumns(headers);
                  const initialMap: Record<string, string> = {};
                  for (const [hdr, fld] of Object.entries(autoMap)) {
                    if (fld) initialMap[fld] = hdr;
                  }
                  setColumnMapping(initialMap);
                  setActiveSheetName(detectedSheet);
                  setStatus('column_mapping');
                } else {
                  setStatus('sheet_selection');
                }
              }
            }}>
              Proceed to Column Mapping
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    let errorTitle = 'Upload Failed';
    let suggestions: string[] = [];

    if (errorType === 'empty') {
      errorTitle = 'Empty File Uploaded';
      suggestions = [
        'Make sure the file size is greater than 0 bytes.',
        'Verify that you have saved the file correctly in your spreadsheet editor.',
        'Ensure the file contains at least one row of resource data.'
      ];
    } else if (errorType === 'unsupported') {
      errorTitle = 'Invalid File Type';
      suggestions = [
        'Supported formats are Excel (.xlsx, .xls) and CSV (.csv).',
        'Verify that you are not uploading a document (like .pdf or .docx) or image file.',
        'Avoid manually renaming the file extension to bypass format restrictions.'
      ];
    } else if (errorType === 'corrupt') {
      errorTitle = 'Corrupt File Format';
      suggestions = [
        'Check if the file is password-protected or encrypted.',
        'Ensure the file opens correctly in Microsoft Excel or Google Sheets first.',
        'If the file was exported from another tool, try re-exporting it and try again.'
      ];
    } else if (errorType === 'empty_sheet') {
      errorTitle = 'No Data Rows Found';
      suggestions = [
        'The sheet must contain at least a header row and one row of tracking records.',
        'Ensure the workbook sheet is not empty or filled only with blank spaces.',
        'Verify that you selected the correct data tab in the spreadsheet.'
      ];
    } else {
      errorTitle = 'Data Reading Failed';
      suggestions = [
        'Check if the file complies with standard spreadsheet layout rules.',
        'Ensure that the sheet does not contain corrupted formulas or custom macros.',
        'If you continue to experience errors, copy the rows to a new clean spreadsheet.'
      ];
    }

    return (
      <div style={{ maxWidth: '800px', margin: '40px auto 0 auto' }}>
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', 
              backgroundColor: 'var(--hcl-error-bg)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px auto'
            }}>
              <AlertCircle size={32} color="var(--hcl-error-text)" />
            </div>
            
            <h2 style={{ marginBottom: '8px', color: 'var(--hcl-error-text)' }}>{errorTitle}</h2>
            <p style={{ color: 'var(--hcl-neutral-400)', maxWidth: '500px', margin: '0 auto 28px auto', lineHeight: 1.5 }}>
              {errorMessage}
            </p>

            <div style={{ 
              backgroundColor: 'var(--hcl-white)', 
              border: '1px solid var(--hcl-neutral-200)',
              borderRadius: 'var(--radius-md)', 
              padding: '20px 24px', 
              maxWidth: '500px', 
              margin: '0 auto 32px auto',
              textAlign: 'left'
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--hcl-ink)', fontWeight: 600 }}>
                Troubleshooting Suggestions:
              </h4>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--hcl-neutral-400)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {suggestions.map((sug, idx) => (
                  <li key={idx} style={{ lineHeight: 1.4 }}>{sug}</li>
                ))}
              </ul>
            </div>

            <Button onClick={() => {
              setFile(null);
              setWorkbook(null);
              setParseResult(null);
              setUploadProgress(0);
              setFileName('');
              setFileSize(0);
              setDetectedSheet(null);
              setErrorType('generic');
              setStatus('idle');
            }}>
              Choose Another File
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (status === 'sheet_selection' && workbook) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto 0 auto' }}>
        <Card>
          <div style={{ marginBottom: '24px' }}>
            <h2>Select Data Sheet</h2>
            <p style={{ color: 'var(--hcl-neutral-400)' }}>
              We couldn't automatically determine which sheet contains the fulfillment data. Please select it below.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {workbook.SheetNames.map(name => {
              const range = XLSX.utils.decode_range(workbook.Sheets[name]['!ref'] || 'A1');
              const rows = range.e.r - range.s.r;
              const cols = range.e.c - range.s.c;
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid var(--hcl-neutral-200)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileSpreadsheet size={20} color="var(--hcl-purple)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>{rows} rows × {cols} columns</div>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => {
                    const headers = getSheetHeaders(workbook.Sheets[name]);
                    const autoMap = autoMapColumns(headers);
                    const initialMap: Record<string, string> = {};
                    for (const [hdr, fld] of Object.entries(autoMap)) {
                      if (fld) initialMap[fld] = hdr;
                    }
                    setColumnMapping(initialMap);
                    setActiveSheetName(name);
                    setStatus('column_mapping');
                  }}>Use Sheet</Button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  if (status === 'column_mapping' && workbook && activeSheetName) {
    const headers = getSheetHeaders(workbook.Sheets[activeSheetName]);
    
    const TARGET_FIELDS = [
      { name: 'id', label: 'Unique ID / Requisition No', required: true },
      { name: 'skillRaw', label: 'Skill / Role Name', required: true },
      { name: 'hiringType', label: 'Hiring Type (Internal/External)', required: true },
      { name: 'raisedDate', label: 'Raised Date', required: true },
      { name: 'fulfilledDate', label: 'Fulfilled Date', required: false },
      { name: 'department', label: 'Department / BU', required: false },
      { name: 'location', label: 'Location / City', required: false },
      { name: 'band', label: 'Employee Band / Grade', required: false },
    ];

    // Validation checks
    const missingFields = TARGET_FIELDS.filter(f => f.required && !columnMapping[f.name]);
    
    // Check for duplicate source columns
    const mappedValues = Object.values(columnMapping).filter(Boolean);
    const duplicates = mappedValues.filter((val, index) => mappedValues.indexOf(val) !== index);
    
    const isValidMapping = missingFields.length === 0 && duplicates.length === 0;

    const handleSelectChange = (fieldName: string, value: string) => {
      setColumnMapping(prev => ({
        ...prev,
        [fieldName]: value === '' ? '' : value
      }));
    };

    const handleProceed = () => {
      if (!isValidMapping) return;
      
      // Build reverse mapping: { [sheetColumnHeader]: targetField }
      const reverseMapping: Record<string, string | null> = {};
      headers.forEach(hdr => {
        // Find which target field maps to this header
        const targetField = Object.keys(columnMapping).find(k => columnMapping[k] === hdr);
        reverseMapping[hdr] = targetField || null;
      });

      processSheet(workbook, activeSheetName, reverseMapping);
    };

    return (
      <div style={{ maxWidth: '800px', margin: '40px auto 0 auto' }}>
        <Card>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ marginBottom: '8px' }}>Map Spreadsheet Columns</h2>
            <p style={{ color: 'var(--hcl-neutral-400)', margin: 0 }}>
              Verify the automatically detected columns for <strong>{activeSheetName}</strong> and map any remaining fields.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            {TARGET_FIELDS.map(field => {
              const currentValue = columnMapping[field.name] || '';
              return (
                <div key={field.name} style={{ display: 'grid', gridTemplateColumns: '250px 1fr', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
                  <label style={{ fontWeight: 500, fontSize: '14px' }}>
                    {field.label} {field.required && <span style={{ color: 'var(--hcl-error-text)' }}>*</span>}
                  </label>
                  <select 
                    value={currentValue}
                    onChange={(e) => handleSelectChange(field.name, e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--hcl-neutral-300)',
                      fontSize: '14px',
                      backgroundColor: 'var(--hcl-white)',
                      color: 'var(--hcl-ink)',
                      width: '100%',
                      outline: 'none',
                    }}
                  >
                    <option value="">[Not Mapped]</option>
                    {headers.map(hdr => (
                      <option key={hdr} value={hdr}>{hdr}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Validation Alerts */}
          {!isValidMapping && (
            <div style={{ padding: '16px', backgroundColor: 'var(--hcl-error-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--hcl-error-text)' }}>
              {missingFields.length > 0 && (
                <div>
                  <strong>Missing Required Mappings:</strong> {missingFields.map(f => f.label).join(', ')} must be mapped to proceed.
                </div>
              )}
              {duplicates.length > 0 && (
                <div>
                  <strong>Duplicate Column Mappings:</strong> The column(s) <em>{duplicates.join(', ')}</em> are mapped to multiple fields. Each source column can only be mapped once.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="outline" onClick={() => {
              if (detectedSheet) {
                setStatus('success');
              } else {
                setStatus('sheet_selection');
              }
            }}>Back</Button>
            <Button onClick={handleProceed} disabled={!isValidMapping}>
              Proceed to Validation <ArrowRight size={16} />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (status === 'validation' && parseResult) {
    const { validData, errors } = parseResult.validationResult;
    const hasErrors = errors.length > 0;
    
    return (
      <div style={{ width: '100%', paddingTop: '40px' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                {hasErrors ? <AlertCircle size={24} color="var(--hcl-warning-text)" /> : <CheckCircle2 size={24} color="var(--hcl-success-text)" />}
                Validation Summary
              </h2>
              <p style={{ color: 'var(--hcl-neutral-400)', margin: '8px 0 0 0' }}>
                Processed {parseResult.totalRows} rows from '{parseResult.sheetName}'
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {hasErrors && <Button variant="outline" onClick={downloadErrorCsv}>Download Error Report</Button>}
              <Button onClick={() => onDataReady(parseResult)}>Continue with {validData.length} valid rows</Button>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div style={{ flex: 1, padding: '16px', backgroundColor: 'var(--hcl-success-bg)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--hcl-success-text)' }}>{validData.length}</div>
              <div style={{ color: 'var(--hcl-success-text)' }}>Valid Rows Ready</div>
            </div>
            <div style={{ flex: 1, padding: '16px', backgroundColor: hasErrors ? 'var(--hcl-error-bg)' : 'var(--hcl-neutral-100)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: hasErrors ? 'var(--hcl-error-text)' : 'var(--hcl-neutral-400)' }}>{errors.length}</div>
              <div style={{ color: hasErrors ? 'var(--hcl-error-text)' : 'var(--hcl-neutral-400)' }}>Rows with Errors</div>
            </div>
          </div>
          
          {hasErrors && (
            <div>
              <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Preview of Failing Rows</h3>
              <div style={{ overflowX: 'auto', border: '1px solid var(--hcl-neutral-200)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1000px' }}>
                  <thead style={{ backgroundColor: 'var(--hcl-neutral-100)' }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--hcl-neutral-200)', fontWeight: 600 }}>Row</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--hcl-neutral-200)', fontWeight: 600 }}>Requisition ID</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--hcl-neutral-200)', fontWeight: 600 }}>Skill/Role</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--hcl-neutral-200)', fontWeight: 600 }}>Hiring Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--hcl-neutral-200)', fontWeight: 600 }}>Raised Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--hcl-neutral-200)', fontWeight: 600 }}>Fulfilled Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--hcl-neutral-200)', fontWeight: 600 }}>Validation Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.slice(0, 15).map((err, i) => {
                      const rowData = err.rowData || {};
                      const isIdError = err.reasons.some(r => r.toLowerCase().includes('id') || r.toLowerCase().includes('requisition'));
                      const isSkillError = err.reasons.some(r => r.toLowerCase().includes('skill'));
                      const isHiringError = err.reasons.some(r => r.toLowerCase().includes('hiring'));
                      const isRaisedError = err.reasons.some(r => r.toLowerCase().includes('raised'));
                      const isFulfilledError = err.reasons.some(r => r.toLowerCase().includes('fulfilled'));

                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--hcl-neutral-100)', backgroundColor: i % 2 === 0 ? 'var(--hcl-white)' : 'var(--hcl-neutral-50)' }}>
                          <td style={{ padding: '12px', color: 'var(--hcl-neutral-500)', fontWeight: 500 }}>#{err.row}</td>
                          <td style={{ padding: '12px', color: isIdError ? 'var(--hcl-error-text)' : 'inherit', fontWeight: isIdError ? 500 : 'normal' }}>
                            {rowData.id ? rowData.id : <span style={{ color: 'var(--hcl-error-text)', fontStyle: 'italic' }}>[Missing]</span>}
                          </td>
                          <td style={{ padding: '12px', color: isSkillError ? 'var(--hcl-error-text)' : 'inherit', fontWeight: isSkillError ? 500 : 'normal' }}>
                            {rowData.skillRaw ? rowData.skillRaw : <span style={{ color: 'var(--hcl-error-text)', fontStyle: 'italic' }}>[Missing]</span>}
                          </td>
                          <td style={{ padding: '12px', color: isHiringError ? 'var(--hcl-error-text)' : 'inherit', fontWeight: isHiringError ? 500 : 'normal' }}>
                            {rowData.hiringType ? rowData.hiringType : <span style={{ color: 'var(--hcl-error-text)', fontStyle: 'italic' }}>[Missing]</span>}
                          </td>
                          <td style={{ padding: '12px', color: isRaisedError ? 'var(--hcl-error-text)' : 'inherit', fontWeight: isRaisedError ? 500 : 'normal' }}>
                            {rowData.raisedDate ? rowData.raisedDate : <span style={{ color: 'var(--hcl-error-text)', fontStyle: 'italic' }}>[Missing]</span>}
                          </td>
                          <td style={{ padding: '12px', color: isFulfilledError ? 'var(--hcl-error-text)' : 'inherit', fontWeight: isFulfilledError ? 500 : 'normal' }}>
                            {rowData.fulfilledDate ? rowData.fulfilledDate : <span style={{ color: 'var(--hcl-neutral-400)', fontStyle: 'italic' }}>[Not Fulfilled]</span>}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {err.reasons.map((reason, j) => (
                                <Badge key={j} variant="error">{reason}</Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {errors.length > 15 && (
                <div style={{ textAlign: 'center', padding: '12px', color: 'var(--hcl-neutral-400)', fontSize: '14px' }}>
                  Showing 15 of {errors.length} errors. Download the report for the full list.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // Idle state
  return (
    <div style={{ maxWidth: '800px', margin: '40px auto 0 auto' }}>
      <Card>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '50%', 
            backgroundColor: 'var(--hcl-purple-tint-10)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px auto'
          }}>
            <UploadCloud size={32} color="var(--hcl-purple)" />
          </div>
          <h2 style={{ marginBottom: '8px' }}>Upload Fulfillment Data</h2>
          <p style={{ color: 'var(--hcl-neutral-400)', maxWidth: '400px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
            Upload your fulfillment tracking export. The system will automatically parse the data, validate requirements, and handle skill clustering.
          </p>
          <div>
            <input 
              type="file" 
              id="file-upload" 
              style={{ display: 'none' }} 
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
            />
            <Button onClick={() => document.getElementById('file-upload')?.click()}>
              Browse Files (.xlsx, .csv)
            </Button>
          </div>
          {status === 'parsing' && (
            <div style={{ marginTop: '24px', color: 'var(--hcl-purple)', fontWeight: 500 }}>
              Parsing file and validating data...
            </div>
          )}
        </div>
      </Card>
    </div>
  );
});
