// Synonym dictionary for fuzzy column mapping
const COLUMN_SYNONYMS: Record<string, string[]> = {
  id: ['id#', 'req id', 'requisition no', 'requistion no', 'serial no.', 'id'],
  raisedDate: ['req create date', 'requirement raised date', 'raised date', 'demand date'],
  fulfilledDate: ['joining date', 'fulfilled date', 'onboard date'],
  hiringType: ['hiring type', 'source', 'internal/external', 'fulfillment source', 'internal/external flag'],
  skillRaw: ['skill', 'skills', 'skill filtered', 'technology', 'skill name', 'role'],
  skillCluster: ['skill mapping cluster', 'skill mapping', 'cluster', 'skill group'],
  department: ['department', 'l3', 'l3 name', 'business unit'],
  location: ['location', 'personal sub area', 'city'],
  band: ['employee band', 'band', 'grade'],
  leadTimeDays: ['lead time', 'lead time (days)', 'tat'],
  period: ['period', 'quarter', 'month', 'fulfilled month', 'fullfilled quarter']
};

/**
 * Normalizes a string by lowercasing and removing non-alphanumeric characters 
 * except spaces to help with fuzzy matching.
 */
function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

/**
 * Calculates Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Finds the best target schema field for a given raw column header.
 * Returns the target field name, or null if no confident match.
 */
export function mapColumnHeader(rawHeader: string): string | null {
  const normalizedRaw = normalizeString(rawHeader);
  
  // Explicitly avoid matching 'Requisition Source' and classifications
  if (normalizedRaw.includes('requisition source') || normalizedRaw.includes('classification')) {
    return null;
  }
  
  let bestMatch: string | null = null;
  let bestScore = Infinity; // Lower is better (distance)
  
  for (const [targetField, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const synonym of synonyms) {
      const normalizedSynonym = normalizeString(synonym);
      
      // Exact match
      if (normalizedRaw === normalizedSynonym) {
        return targetField;
      }
      
      // Substring match
      if (normalizedRaw.includes(normalizedSynonym) || normalizedSynonym.includes(normalizedRaw)) {
        // Prevent false match of synonym 'source' to raw headers containing 'resource' (e.g. resource band)
        if (normalizedSynonym === 'source' && normalizedRaw.includes('resource')) {
          continue;
        }
        
        // If it's a good substring match, prioritize it but continue searching for exact
        if (bestScore > 2) { 
          bestMatch = targetField;
          bestScore = 2; // Arbitrary low score for substring match
        }
      }
      
      // Fuzzy match (Levenshtein) - only if words are somewhat similar in length
      if (Math.abs(normalizedRaw.length - normalizedSynonym.length) < 5) {
        const distance = levenshteinDistance(normalizedRaw, normalizedSynonym);
        if (distance <= 2 && distance < bestScore) { // Allow up to 2 typos
          bestMatch = targetField;
          bestScore = distance;
        }
      }
    }
  }
  
  return bestMatch;
}

/**
 * Attempts to auto-map all columns in a dataset.
 * Returns a mapping of { rawHeaderName: targetFieldName }.
 */
export function autoMapColumns(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const header of headers) {
    mapping[header] = mapColumnHeader(header);
  }
  return mapping;
}
