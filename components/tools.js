/**
 * Parse a JSON payload and return the payload as an Array
 * Handles both: {"payload": [...]} and {"payload": "[...]"}
 * @param {string} jsonString - JSON string with payload
 * @returns {Array} - The payload as an array, or empty array if parsing fails
 */
export const parseArrayPayload = jsonString => {
  try {
    // Try standard JSON parse first
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed) return [];

      if (Array.isArray(parsed.payload)) {
        return parsed.payload;
      }
      if (typeof parsed.payload === 'string') {
        const inner = JSON.parse(parsed.payload);
        return Array.isArray(inner) ? inner : [];
      }
    } catch (parseError) {
      // Handle malformed JSON where inner quotes aren't escaped
      // e.g., {"payload":"["0:8:0:60:127"]","timestamp":"..."}
      const match = jsonString.match(/"payload"\s*:\s*"\[([^\]]*)\]"/);
      if (match) {
        const innerContent = match[1];
        if (!innerContent || innerContent.trim() === '') {
          return [];
        }
        // Split by "," and clean up quotes
        const items = innerContent
          .split(/",\s*"/)
          .map(item => item.replace(/^"|"$/g, '').trim())
          .filter(item => item.length > 0);
        return items;
      }
    }
    return [];
  } catch (e) {
    return [];
  }
};

/**
 * Parse a JSON payload and return the payload as a String
 * @param {string} jsonString - JSON string in format {"payload": string, "timestamp": string}
 * @returns {string} - The payload as a string, or empty string if parsing fails
 */
export const parseStringPayload = jsonString => {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed.payload === 'string') {
      return parsed.payload;
    }
    return '';
  } catch (e) {
    console.error('Error parsing string payload:', e);
    return '';
  }
};
