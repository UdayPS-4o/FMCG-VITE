// GSTIN validator with checksum algorithm
export const validateGSTIN = (gstin: string): boolean => {
  // Basic format check - 15 alphanumeric characters
  if (!/^[0-9A-Z]{15}$/.test(gstin)) return false;
  
  // Checksum validation
  return checkGSTINChecksum(gstin);
};

// GSTIN checksum algorithm
export const checkGSTINChecksum = (g: string): boolean => {
  const a = 65, b = 55, c = 36;
  
  // Modified implementation that avoids redeclaration issues
  const lastChar = g[14];
  const body = g.substring(0, 14);
  
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    const charValue = char.charCodeAt(0) < a ? parseInt(char) : char.charCodeAt(0) - b;
    const factor = (i % 2) + 1;
    let product = charValue * factor;
    
    if (product > c) {
      product = 1 + (product - c);
    }
    
    sum += product;
  }
  
  const remainder = sum % c;
  const checksum = (c - remainder) % c;
  const expectedChar = checksum < 10 ? checksum.toString() : String.fromCharCode(checksum + b);
  
  return lastChar === expectedChar;
};

// PAN validator
export const validatePAN = (p: string): boolean => {
  if (!/^[A-Z]{3}[PFCHAAT][A-Z][0-9]{4}[A-Z]$/.test(p)) return false;
  return true;
};

// PAN format validation for progressive typing
export const validatePANFormat = (p: string, position: number): boolean => {
  if (position < 0 || position >= p.length) return true;
  
  // First 5 characters: Should be uppercase alphabets
  if (position < 5) {
    if (position < 3) {
      // First 3 characters: any uppercase alphabet
      return /^[A-Z]$/.test(p[position]);
    } else if (position === 3) {
      // 4th character: P, F, C, H, A, T
      return /^[PFCHAAT]$/.test(p[position]);
    } else {
      // 5th character: any uppercase alphabet
      return /^[A-Z]$/.test(p[position]);
    }
  }
  // 6-9 characters: Should be digits
  else if (position >= 5 && position < 9) {
    return /^[0-9]$/.test(p[position]);
  }
  // Last character: Should be uppercase alphabet
  else {
    return /^[A-Z]$/.test(p[position]);
  }
};

// GSTIN format validation for progressive typing
export const validateGSTINFormat = (g: string, position: number): boolean => {
  if (position < 0 || position >= g.length) return true;
  
  // First 2 characters: State code (digits)
  if (position < 2) {
    return /^[0-9]$/.test(g[position]);
  }
  // 3-12 characters: PAN number (mixed format)
  else if (position >= 2 && position < 12) {
    const panPosition = position - 2;
    if (panPosition < 5) {
      if (panPosition < 3) {
        // First 3 characters: any uppercase alphabet
        return /^[A-Z]$/.test(g[position]);
      } else if (panPosition === 3) {
        // 4th character: P, F, C, H, A, T
        return /^[PFCHAAT]$/.test(g[position]);
      } else {
        // 5th character: any uppercase alphabet
        return /^[A-Z]$/.test(g[position]);
      }
    } else {
      // 6-9 characters of PAN: Should be digits
      return /^[0-9]$/.test(g[position]);
    }
  }
  // 13th character: Entity number (1-9)
  else if (position === 12) {
    return /^[1-9]$/.test(g[position]);
  }
  // 14th character: Z by default for all taxpayers
  else if (position === 13) {
    return /^[A-Z]$/.test(g[position]);
  }
  // 15th character: Checksum
  else {
    return /^[0-9A-Z]$/.test(g[position]);
  }
};

// FSSAI validator
export const validateFSSAI = (fssai: string): true | string => {
  if (!/^\d{14}$/.test(fssai)) return "FSSAI number must be exactly 14 digits";

  const type = fssai[0];
  const state = fssai.slice(1, 3);
  const year = parseInt(fssai.slice(3, 5), 10);
  const officer = parseInt(fssai.slice(5, 8), 10);
  const serial = parseInt(fssai.slice(8), 10);

  if (!["1", "2"].includes(type)) return "Invalid type digit (must be 1 or 2)";

  const validStates = Array.from({ length: 37 }, (_, i) => String(i + 1).padStart(2, "0"));
  if (!validStates.includes(state)) return "Invalid state code (digits 2-3)";

  const currentYearYY = new Date().getFullYear() % 100;
  if (year < 6 || year > currentYearYY) return `Invalid year ${year} (digits 4-5): should be between 06 and ${currentYearYY}`;

  if (officer < 1 || officer > 999) return "Invalid officer code (digits 6-8)";

  if (serial < 1 || serial > 999999) return "Invalid serial number (digits 9-14)";

  return true;
};

// Function to fetch GSTIN details from API
export const fetchGSTINDetails = async (gstin: string): Promise<unknown> => {
  try {
    const response = await fetch(`https://udayps.com/api/gst/?gstin=${gstin}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching GSTIN details:", error);
    return null;
  }
};