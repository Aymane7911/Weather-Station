import { ParseResult } from 'papaparse';

// Types for CSV parsing configuration and results
export interface CSVParseOptions {
  header?: boolean;
  delimiter?: string;
  skipEmptyLines?: boolean;
  dynamicTyping?: boolean;
  encoding?: string;
  preview?: number;
  transform?: (value: string, field: string | number) => any;
  complete?: (results: ParseResult<any>) => void;
  error?: (error: Error) => void;
  skipFirstNLines?: number;
  fastMode?: boolean;
  comments?: boolean;
  delimitersToGuess?: string[];
}

export interface ParsedCSVData<T = any> {
  data: T[];
  meta: {
    fields?: string[];
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
  };
  errors: Array<{
    type: string;
    code: string;
    message: string;
    row?: number;
  }>;
}

export interface CSVValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  rowCount: number;
  columnCount: number;
  headers?: string[];
  hasConsistentStructure: boolean;
  delimiter: string;
}

export class CSVParser {
  private defaultOptions: CSVParseOptions = {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // Changed to false for better control
    delimiter: '',
    encoding: 'utf-8',
    fastMode: false,
    comments: false,
    delimitersToGuess: [',', ';', '\t', '|']
  };

  /**
   * Parse CSV from string data with enhanced error handling
   */
  public parseFromString<T = any>(
    csvString: string, 
    options: CSVParseOptions = {}
  ): Promise<ParsedCSVData<T>> {
    return new Promise((resolve, reject) => {
      // Dynamically import Papa Parse to avoid SSR issues
      import('papaparse').then((Papa) => {
        // Clean the CSV string first
        const cleanedCSV = this.cleanCSVString(csvString);
        
        const parseOptions: any = {
          ...this.defaultOptions,
          ...options,
          complete: (results: ParseResult<T>) => {
            // Post-process the results for better error handling
            const processedResults = this.postProcessResults(results, cleanedCSV);
            resolve(processedResults);
          },
          error: (error: Error) => {
            reject(error);
          }
        };

        Papa.default.parse(cleanedCSV, parseOptions);
      }).catch(reject);
    });
  }

  /**
   * Clean CSV string to handle common issues
   */
  private cleanCSVString(csvString: string): string {
    if (!csvString || typeof csvString !== 'string') {
      return '';
    }

    // Remove BOM if present
    let cleaned = csvString.replace(/^\uFEFF/, '');
    
    // Handle different line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Remove trailing empty lines
    cleaned = cleaned.replace(/\n+$/, '');
    
    // Handle malformed quotes - replace smart quotes with regular quotes
    cleaned = cleaned.replace(/[""]/g, '"').replace(/['']/g, "'");
    
    return cleaned;
  }

  /**
   * Post-process parsing results to handle errors more gracefully
   */
  private postProcessResults<T>(results: ParseResult<T>, originalCSV: string): ParsedCSVData<T> {
    const processedData: T[] = [];
    const processedErrors: Array<{type: string; code: string; message: string; row?: number}> = [];

    // Filter out completely empty rows and malformed data
    if (results.data && Array.isArray(results.data)) {
      results.data.forEach((row: any, index: number) => {
        if (row === null || row === undefined) {
          return; // Skip null/undefined rows
        }

        // If it's an object, check if it has any meaningful data
        if (typeof row === 'object') {
          const values = Object.values(row).filter(value => 
            value !== null && value !== undefined && value !== ''
          );
          
          if (values.length > 0) {
            processedData.push(row);
          }
        } else if (row !== '' && row !== null && row !== undefined) {
          processedData.push(row);
        }
      });
    }

    // Filter errors to only include critical ones
    if (results.errors) {
      results.errors.forEach(error => {
        // Only include errors that are actually problematic
        if (error.type === 'Delimiter' || 
            error.type === 'Quotes' || 
            (error.type === 'FieldMismatch' && processedData.length === 0)) {
          processedErrors.push(error);
        }
      });
    }

    return {
      data: processedData,
      meta: results.meta,
      errors: processedErrors
    };
  }

  /**
   * Parse CSV from File object (for file uploads)
   */
  public parseFromFile<T = any>(
    file: File, 
    options: CSVParseOptions = {}
  ): Promise<ParsedCSVData<T>> {
    return new Promise((resolve, reject) => {
      import('papaparse').then((Papa) => {
        const parseOptions: any = {
          ...this.defaultOptions,
          ...options,
          complete: (results: ParseResult<T>) => {
            const processedResults = this.postProcessResults(results, '');
            resolve(processedResults);
          },
          error: (error: Error) => {
            reject(error);
          }
        };

        Papa.default.parse(file, parseOptions);
      }).catch(reject);
    });
  }

  /**
   * Parse CSV from Azure Blob or URL
   */
  public async parseFromUrl<T = any>(
    url: string, 
    options: CSVParseOptions = {}
  ): Promise<ParsedCSVData<T>> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const csvString = await response.text();
      return this.parseFromString<T>(csvString, options);
    } catch (error) {
      throw new Error(`Failed to fetch CSV from URL: ${error}`);
    }
  }

  /**
   * Enhanced CSV validation with better structure checking
   */
  public async validateCSV(csvString: string): Promise<CSVValidationResult> {
    try {
      if (!csvString || csvString.trim().length === 0) {
        return {
          isValid: false,
          errors: ['CSV string is empty'],
          warnings: [],
          rowCount: 0,
          columnCount: 0,
          hasConsistentStructure: false,
          delimiter: ','
        };
      }

      const cleanedCSV = this.cleanCSVString(csvString);
      
      // Detect delimiter first
      const delimiter = this.detectDelimiter(cleanedCSV);
      
      // Parse with preview to check structure
      const result = await this.parseFromString(cleanedCSV, {
        preview: 10,
        skipEmptyLines: false,
        delimiter: delimiter
      });

      const validation: CSVValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        rowCount: 0,
        columnCount: 0,
        headers: result.meta.fields,
        hasConsistentStructure: true,
        delimiter: delimiter
      };

      // Check for critical parsing errors
      const criticalErrors = result.errors.filter(err => 
        err.type === 'Delimiter' || err.type === 'Quotes'
      );

      if (criticalErrors.length > 0) {
        validation.isValid = false;
        validation.errors = criticalErrors.map(err => err.message);
      }

      // Get actual row count by parsing without preview
      try {
        const fullResult = await this.parseFromString(cleanedCSV, { delimiter });
        validation.rowCount = fullResult.data.length;
        validation.columnCount = result.meta.fields?.length || 0;

        // Check structure consistency
        if (fullResult.data.length > 0) {
          const firstRowKeys = Object.keys(fullResult.data[0] || {});
          let inconsistentCount = 0;

          fullResult.data.forEach((row: any) => {
            if (typeof row === 'object' && row !== null) {
              const rowKeys = Object.keys(row);
              if (rowKeys.length !== firstRowKeys.length) {
                inconsistentCount++;
              }
            }
          });

          if (inconsistentCount > fullResult.data.length * 0.1) { // More than 10% inconsistent
            validation.hasConsistentStructure = false;
            validation.warnings.push(`${inconsistentCount} rows have inconsistent structure`);
          }
        }
      } catch (fullParseError) {
        validation.warnings.push('Could not validate full file structure');
      }

      // Basic validations
      if (validation.rowCount === 0) {
        validation.isValid = false;
        validation.errors.push('No data rows found');
      }

      if (validation.columnCount === 0) {
        validation.warnings.push('No headers detected');
      }

      return validation;
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation failed: ${error}`],
        warnings: [],
        rowCount: 0,
        columnCount: 0,
        hasConsistentStructure: false,
        delimiter: ','
      };
    }
  }

  /**
   * Enhanced delimiter detection
   */
  private detectDelimiter(csvString: string): string {
    const delimiters = [',', ';', '\t', '|'];
    const lines = csvString.split('\n').slice(0, 5); // Check first 5 lines
    
    let maxScore = 0;
    let detectedDelimiter = ',';
    
    delimiters.forEach(delimiter => {
      let score = 0;
      let consistency = 0;
      const counts: number[] = [];
      
      lines.forEach(line => {
        if (line.trim()) {
          const count = (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
          counts.push(count);
          score += count;
        }
      });
      
      // Check consistency of delimiter usage across lines
      if (counts.length > 1) {
        const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((a, b) => a + Math.pow(b - avgCount, 2), 0) / counts.length;
        consistency = avgCount > 0 ? Math.max(0, avgCount - variance) : 0;
      } else {
        consistency = counts[0] || 0;
      }
      
      const finalScore = score + consistency * 10; // Weight consistency heavily
      
      if (finalScore > maxScore) {
        maxScore = finalScore;
        detectedDelimiter = delimiter;
      }
    });
    
    return detectedDelimiter;
  }

  /**
   * Convert parsed data to specific format for dashboard consumption
   */
  public transformForDashboard<T = any>(
    parsedData: ParsedCSVData<T>,
    transformOptions?: {
      dateFields?: string[];
      numericFields?: string[];
      requiredFields?: string[];
      defaultValues?: Record<string, any>;
    }
  ): T[] {
    if (!parsedData.data || parsedData.data.length === 0) {
      return [];
    }

    return parsedData.data.map((row: any) => {
      const transformedRow = { ...row };

      // Handle date fields
      if (transformOptions?.dateFields) {
        transformOptions.dateFields.forEach(field => {
          if (transformedRow[field]) {
            const date = new Date(transformedRow[field]);
            if (!isNaN(date.getTime())) {
              transformedRow[field] = date.toISOString();
            }
          }
        });
      }

      // Handle numeric fields with better error handling
      if (transformOptions?.numericFields) {
        transformOptions.numericFields.forEach(field => {
          if (transformedRow[field] !== undefined && transformedRow[field] !== null) {
            const value = String(transformedRow[field]).replace(/,/g, ''); // Remove commas
            const num = parseFloat(value);
            if (!isNaN(num) && isFinite(num)) {
              transformedRow[field] = num;
            } else {
              // Set to default value if available, otherwise 0
              transformedRow[field] = transformOptions?.defaultValues?.[field] || 0;
            }
          }
        });
      }

      // Apply default values for missing required fields
      if (transformOptions?.requiredFields && transformOptions?.defaultValues) {
        transformOptions.requiredFields.forEach(field => {
          if (transformedRow[field] === undefined || transformedRow[field] === null || transformedRow[field] === '') {
            if (transformOptions.defaultValues && transformOptions.defaultValues[field] !== undefined) {
              transformedRow[field] = transformOptions.defaultValues[field];
            }
          }
        });
      }

      return transformedRow;
    });
  }

  /**
   * Extract metadata from parsed CSV
   */
  public extractMetadata(parsedData: ParsedCSVData<any>) {
    const metadata = {
      totalRows: parsedData.data.length,
      totalColumns: parsedData.meta.fields?.length || 0,
      headers: parsedData.meta.fields || [],
      delimiter: parsedData.meta.delimiter,
      hasErrors: parsedData.errors.length > 0,
      errorCount: parsedData.errors.length,
      columnTypes: {} as Record<string, string>,
      parsedAt: new Date().toISOString()
    };

    // Analyze data types for each column
    if (parsedData.data.length > 0 && parsedData.meta.fields) {
      parsedData.meta.fields.forEach(field => {
        const sampleValues = parsedData.data
          .slice(0, Math.min(100, parsedData.data.length))
          .map((row: any) => row[field])
          .filter(val => val !== null && val !== undefined && val !== '');

        if (sampleValues.length === 0) {
          metadata.columnTypes[field] = 'unknown';
          return;
        }

        // Check if all values are numbers
        if (sampleValues.every(val => !isNaN(parseFloat(String(val))) && isFinite(parseFloat(String(val))))) {
          metadata.columnTypes[field] = 'number';
        }
        // Check if all values are dates
        else if (sampleValues.every(val => !isNaN(Date.parse(String(val))))) {
          metadata.columnTypes[field] = 'date';
        }
        // Check if all values are booleans
        else if (sampleValues.every(val => {
          const strVal = String(val).toLowerCase();
          return strVal === 'true' || strVal === 'false' || 
                 strVal === '1' || strVal === '0' ||
                 strVal === 'yes' || strVal === 'no';
        })) {
          metadata.columnTypes[field] = 'boolean';
        }
        else {
          metadata.columnTypes[field] = 'string';
        }
      });
    }

    return metadata;
  }

  /**
   * Sanitize CSV data for security (remove potentially harmful content)
   */
  public sanitizeData<T = any>(data: T[]): T[] {
    return data.map(row => {
      if (typeof row === 'object' && row !== null) {
        const sanitizedRow: any = {};
        
        Object.entries(row).forEach(([key, value]) => {
          if (typeof value === 'string') {
            // Remove potential script tags and other harmful content
            sanitizedRow[key] = value
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/javascript:/gi, '')
              .replace(/on\w+\s*=/gi, '')
              .replace(/data:text\/html/gi, '')
              .trim();
          } else {
            sanitizedRow[key] = value;
          }
        });
        
        return sanitizedRow;
      }
      return row;
    });
  }

  /**
   * Convert CSV data back to CSV string
   */
  public async dataToCSV<T = any>(
    data: T[], 
    options: { headers?: string[]; delimiter?: string } = {}
  ): Promise<string> {
    const Papa = await import('papaparse');
    
    return Papa.default.unparse(data, {
      header: true,
      delimiter: options.delimiter || ',',
      columns: options.headers
    });
  }

  /**
   * Attempt to repair malformed CSV data
   */
  public repairCSV(csvString: string): string {
    if (!csvString || typeof csvString !== 'string') {
      return '';
    }

    let repaired = this.cleanCSVString(csvString);
    
    // Fix common quote issues
    const lines = repaired.split('\n');
    const repairedLines = lines.map(line => {
      if (!line.trim()) return line;
      
      // Count quotes in line
      const quoteCount = (line.match(/"/g) || []).length;
      
      // If odd number of quotes, likely a quote issue
      if (quoteCount % 2 !== 0) {
        // Try to fix by adding a quote at the end
        if (line.endsWith(',') || line.endsWith(';')) {
          return line.slice(0, -1) + '"' + line.slice(-1);
        } else {
          return line + '"';
        }
      }
      
      return line;
    });
    
    return repairedLines.join('\n');
  }
}

// Export singleton instance
export const csvParser = new CSVParser();

// Utility functions for common CSV operations
export const csvUtils = {
  /**
   * Quick parse with common options for dashboard data
   */
  parseDashboardCSV: async <T = any>(csvString: string): Promise<ParsedCSVData<T>> => {
    // First attempt with strict parsing
    try {
      return await csvParser.parseFromString<T>(csvString, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: '',
        fastMode: false,
        transform: (value: string, field: string | number) => {
          if (typeof value === 'string') {
            value = value.trim();
            if (value === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'n/a') {
              return null;
            }
          }
          return value;
        }
      });
    } catch (error) {
      // If that fails, try with repaired CSV
      console.warn('Initial parsing failed, attempting to repair CSV:', error);
      const repairedCSV = csvParser.repairCSV(csvString);
      
      return csvParser.parseFromString<T>(repairedCSV, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: '',
        fastMode: false,
        comments: false,
        transform: (value: string, field: string | number) => {
          if (typeof value === 'string') {
            value = value.trim();
            if (value === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'n/a') {
              return null;
            }
          }
          return value;
        }
      });
    }
  },

  /**
   * Parse Azure exported CSV with enhanced error handling
   */
  parseAzureCSV: async <T = any>(csvString: string): Promise<ParsedCSVData<T>> => {
    return csvParser.parseFromString<T>(csvString, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      delimiter: '',
      fastMode: false,
      transform: (value: string, field: string | number) => {
        if (typeof value === 'string') {
          value = value.trim();
          
          // Handle Azure-specific datetime formats
          if (value.includes('T') && (value.includes('Z') || value.includes('+'))) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          }
          
          // Handle Azure boolean representations
          const lowerValue = value.toLowerCase();
          if (lowerValue === 'true' || lowerValue === 'false') {
            return lowerValue === 'true';
          }
          
          if (value === '' || value === 'null') {
            return null;
          }
        }
        return value;
      }
    });
  },

  /**
   * Robust CSV parsing with multiple fallback strategies
   */
  parseRobustCSV: async <T = any>(csvString: string): Promise<ParsedCSVData<T>> => {
    const strategies = [
      // Strategy 1: Standard parsing
      {
        name: 'standard',
        options: {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          delimiter: '',
          fastMode: false
        }
      },
      // Strategy 2: With quote handling
      {
        name: 'quote-aware',
        options: {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          delimiter: '',
          fastMode: false,
          quoteChar: '"',
          escapeChar: '"'
        }
      },
      // Strategy 3: Comma-specific
      {
        name: 'comma-specific',
        options: {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          delimiter: ',',
          fastMode: false
        }
      },
      // Strategy 4: Tab-specific
      {
        name: 'tab-specific',
        options: {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          delimiter: '\t',
          fastMode: false
        }
      }
    ];

    let lastError: Error | null = null;
    
    for (const strategy of strategies) {
      try {
        const result = await csvParser.parseFromString<T>(csvString, strategy.options);
        
        // Check if we got meaningful data
        if (result.data && result.data.length > 0) {
          // Check for critical errors
          const criticalErrors = result.errors.filter(err => 
            err.type === 'Delimiter' || err.type === 'Quotes'
          );
          
          if (criticalErrors.length === 0) {
            console.log(`CSV parsing successful with strategy: ${strategy.name}`);
            return result;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Strategy ${strategy.name} failed:`, error);
        continue;
      }
    }
    
    // If all strategies fail, try repairing the CSV
    try {
      console.warn('All parsing strategies failed, attempting CSV repair');
      const repairedCSV = csvParser.repairCSV(csvString);
      return csvParser.parseFromString<T>(repairedCSV, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: '',
        fastMode: false
      });
    } catch (repairError) {
      throw lastError || repairError;
    }
  },

  /**
   * Enhanced delimiter detection
   */
  detectDelimiter: (csvString: string): string => {
    return csvParser['detectDelimiter'](csvString);
  }
};
