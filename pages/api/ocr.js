import { IncomingForm } from 'formidable';
import { createWorker } from 'tesseract.js';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Extract and validate card numbers from OCR text
function extractCardNumbers(text) {
  // Remove all non-digit characters and spaces
  const cleanText = text.replace(/[^\d\s]/g, ' ');
  
  // Look for sequences of 4 digits (typical card number grouping)
  const digitGroups = cleanText.match(/\b\d{4}\b/g) || [];
  
  // Look for longer sequences that might be card numbers
  const longNumbers = cleanText.match(/\d{13,19}/g) || [];
  
  // Combine and deduplicate
  const allNumbers = [...digitGroups, ...longNumbers];
  
  return {
    digitGroups,
    longNumbers,
    allNumbers: [...new Set(allNumbers)]
  };
}

// Add a list of common first and last names for validation
const commonNames = [
  'EISHA', 'KHANNA', 'JOHN', 'DOE', 'JANE', 'SMITH', 'DAVID', 'MARIA', 'JAMES', 'LIN', 'PATEL', 'SINGH', 'LEE', 'KIM', 'GARCIA', 'BROWN', 'WILSON', 'TAYLOR', 'ANDERSON', 'THOMAS', 'JACKSON', 'WHITE', 'HARRIS', 'MARTIN', 'THOMPSON', 'RODRIGUEZ', 'LEWIS', 'WALKER', 'YOUNG', 'ALLEN', 'KING', 'WRIGHT', 'SCOTT', 'TORRES', 'NGUYEN', 'HILL', 'FLORES', 'GREEN', 'ADAMS', 'NELSON', 'BAKER', 'HALL', 'RIVERA', 'CAMPBELL', 'MITCHELL', 'CARTER', 'ROBERTS', 'GOMEZ', 'PHILLIPS', 'EVANS', 'TURNER', 'DIAZ', 'PEREZ', 'MURPHY', 'COOK', 'ROGERS', 'MORGAN', 'COOPER', 'REED', 'BAILEY', 'BELL', 'GONZALEZ', 'SANDERS', 'LONG', 'RAMIREZ', 'FOSTER', 'JAMES', 'BUTLER', 'SIMMONS', 'FOSTER', 'BRYANT', 'ALEXANDER', 'RUSSELL', 'GRIFFIN', 'DIAZ', 'HAYES', 'MYERS', 'FORD', 'HAMILTON', 'GRAHAM', 'SULLIVAN', 'WALLACE', 'WOODS', 'COLE', 'WEST', 'JORDAN', 'OWENS', 'REYNOLDS', 'FISHER', 'ELLIS', 'HARRISON', 'GIBSON', 'MCDONALD', 'CRUZ', 'MARSHALL', 'ORTIZ', 'GOMEZ', 'MURRAY', 'FREEMAN', 'WELLS', 'WEBB', 'SIMPSON', 'STEVENS', 'TUCKER', 'PORTER', 'HUNTER', 'HICKS', 'CRAWFORD', 'HENRY', 'BOYD', 'MASON', 'MORALES', 'KENNEDY', 'WARREN', 'DIXON', 'RAMOS', 'REYES', 'BURNS', 'GORDON', 'SHAW', 'HOLMES', 'RICE', 'ROBERTSON', 'HUNT', 'BLACK', 'DANIELS', 'PALMER', 'MILLS', 'NICHOLS', 'GRANT', 'KNIGHT', 'FERGUSON', 'ROSE', 'STONE', 'HAWKINS', 'DUNN', 'PERKINS', 'HUDSON', 'SPENCER', 'GARDNER', 'STEPHENS', 'PAYNE', 'PIERCE', 'BERRY', 'MATTHEWS', 'ARNOLD', 'WAGNER', 'WILLIS', 'RAY', 'WATKINS', 'OLSON', 'CARROLL', 'DUNCAN', 'SNYDER', 'HART', 'CUNNINGHAM', 'BRADLEY', 'LANE', 'ANDREWS', 'RUIZ', 'HARPER', 'FOX', 'RILEY', 'ARMSTRONG', 'CARPENTER', 'WEAVER', 'GREENE', 'LAWRENCE', 'ELLIOTT', 'CHAVEZ', 'SIMS', 'AUSTIN', 'PETERS', 'KELLEY', 'FRANKLIN', 'LAWSON', 'FIELDS', 'GUTIERREZ', 'RYAN', 'SCHMIDT', 'CARR', 'VASQUEZ', 'CASTILLO', 'WHEELER', 'CHAPMAN', 'OLIVER', 'MONTGOMERY', 'RICHARDS', 'WILLIAMSON', 'JOHNSTON', 'BANKS', 'MEYER', 'BISHOP', 'MCCOY', 'HOWELL', 'ALVAREZ', 'MORRISON', 'HANSEN', 'FERNANDEZ', 'GARZA', 'HARVEY', 'LITTLE', 'BURTON', 'STANLEY', 'NGUYEN', 'GEORGE', 'JACOBS', 'REID', 'KIM', 'FULLER', 'LYNCH', 'DEAN', 'GILBERT', 'GARRETT', 'ROMERO', 'WELCH', 'LARSON', 'FRAZIER', 'BURKE', 'HANSON', 'DAY', 'MENDOZA', 'MORENO', 'BOWMAN', 'MEDINA', 'FOWLER', 'BREWER', 'HOFFMAN', 'CARLSON', 'SILVA', 'PEARSON', 'HOLLAND', 'DOUGLAS', 'FLEMING', 'JENSEN', 'VARGAS', 'BYRD', 'DAVIDSON', 'HOPKINS', 'MAY', 'TERRY', 'HERRERA', 'WADE', 'SOTO', 'WALTERS', 'CURTIS', 'NEAL', 'CALDWELL', 'LOWE', 'JENNINGS', 'BARNETT', 'GRAVES', 'JIMENEZ', 'HORTON', 'SHELTON', 'BARRETT', 'OBRIEN', 'CASTRO', 'SUTTON', 'GREGORY', 'MCKINNEY', 'LUCAS', 'MILES', 'CRAIG', 'RODRIQUEZ', 'CHAMBERS', 'HOLT', 'LAMBERT', 'FLETCHER', 'WATTS', 'BATES', 'HALE', 'RHODES', 'PENA', 'BECK', 'NEWMAN', 'HAYNES', 'MCDANIEL', 'MENDEZ', 'BUSH', 'VAUGHN', 'PARKS', 'DAWSON', 'SANTIAGO', 'NORRIS', 'HARDY', 'LOVE', 'STEELE', 'CURRY', 'POWERS', 'SCHULTZ', 'BARKER', 'GUZMAN', 'PAGE', 'MUNOZ', 'BALL', 'KELLER', 'CHANDLER', 'WEBER', 'LEONARD', 'WALSH', 'LYONS', 'RAMSEY', 'WOLFE', 'SCHNEIDER', 'MULLINS', 'BENSON', 'SHARP', 'BOWEN', 'DANIEL', 'BARBER', 'CUMMINGS', 'HINES', 'BALDWIN', 'GRIFFITH', 'VALDEZ', 'HUBBARD', 'SALAZAR', 'REEVES', 'WARNER', 'STEVENSON', 'BURGESS', 'SANTOS', 'TATE', 'CROSS', 'GARNER', 'MANN', 'MACK', 'MOSS', 'THORNTON', 'DENNIS', 'MCGEE', 'FARMER', 'DELGADO', 'AGUILAR', 'VEGA', 'GLOVER', 'MANNING', 'COHEN', 'HARMON', 'RODGERS', 'ROBBINS', 'NEWTON', 'TODD', 'BLAIR', 'HIGGINS', 'INGRAM', 'REESE', 'CANNON', 'STRICKLAND', 'TOWNSEND', 'POTTER', 'GOODWIN', 'WALTON', 'ROWE', 'HAMPTON', 'ORTEGA', 'PATTON', 'SWANSON', 'JOSEPH', 'FRANCIS', 'GOODMAN', 'MALDONADO', 'YATES', 'BECKER', 'ERICKSON', 'HODGES', 'RIOS', 'CONNER', 'ADKINS', 'WEBSTER', 'NORMAN', 'MALONE', 'HAMMOND', 'FLOWERS', 'COBB', 'MOODY', 'QUINN', 'BLAKE', 'MAXWELL', 'POPE', 'FLOYD', 'OSBORNE', 'PAUL', 'MCCARTHY', 'GUERRERO', 'LINDSEY', 'ESTRADA', 'SANDOVAL', 'GIBBS', 'TYLER', 'GROSS', 'FITZGERALD', 'STOKES', 'DOYLE', 'SHERMAN', 'SAUNDERS', 'WISE', 'COLON', 'GILL', 'ALVARADO', 'GREER', 'PADILLA', 'SIMON', 'WATERS', 'NUNEZ', 'BALLARD', 'SCHWARTZ', 'MCBRIDE', 'HOUSTON', 'CHRISTENSEN', 'KLEIN', 'PRATT', 'BRIGGS', 'PARSONS', 'MCLAUGHLIN', 'ZIMMERMAN', 'FRENCH', 'BUCHANAN', 'MORAN', 'COPELAND', 'ROY', 'PITTMAN', 'BRADY', 'MCCORMICK', 'HOLLOWAY', 'BROCK', 'POOLE', 'FRANK', 'LOGAN', 'OWEN', 'BASS', 'MARSH', 'DRAKE', 'WONG', 'JEFFERSON', 'PARK', 'MORTON', 'ABBOTT', 'SPARKS', 'PATRICK', 'NORTON', 'HUFF', 'CLAYTON', 'MASSEY', 'LLOYD', 'FIGUEROA', 'CARSON', 'BOWERS', 'ROBERSON', 'BARTON', 'TRAN', 'LAMB', 'HARRINGTON', 'CASEY', 'BOONE', 'CORTEZ', 'CLARKE', 'MATHIS', 'SINGLETON', 'WILKINS', 'CAIN', 'BRYAN', 'UNDERWOOD', 'HOGAN', 'MCKENZIE', 'COLLIER', 'LUNA', 'PHELPS', 'MCGUIRE', 'ALLISON', 'BRIDGES', 'WILKERSON', 'NASH', 'SUMMERS', 'ATKINS', 'WILCOX', 'PITTS', 'CONLEY', 'MARQUEZ', 'BURNETT', 'RICHARD', 'COCHRAN', 'CHASE', 'DAVENPORT', 'HOOD', 'GATES', 'CLAY', 'AYALA', 'SAWYER', 'ROMAN', 'VAZQUEZ', 'DICKERSON', 'HODGE', 'ACOSTA', 'FLYNN', 'ESPINOZA', 'NICHOLSON', 'MONROE', 'WOLF', 'MORROW', 'KIRBY', 'HUBER', 'BRANCH', 'MCMAHON', 'CARRILLO', 'VALENTINE', 'MADDEN', 'PENA'];

// Extract cardholder name from OCR text
function extractCardholderName(text) {
  // Common branding and non-name words to exclude
  const forbiddenWords = [
    'VISA', 'MASTERCARD', 'AMERICAN', 'EXPRESS', 'DISCOVER', 'PLATINUM', 'PLATINUF', 'DEBIT', 'CREDIT', 'BANK', 'ELECTRON', 'GOLD', 'SILVER', 'CLASSIC', 'SIGNATURE', 'BUSINESS', 'CORPORATE', 'REWARDS', 'PREMIER', 'WORLD', 'INFINITE', 'CARD', 'VALID', 'MEMBER', 'ELECTRONIC', 'MONTH', 'YEAR', 'EXP', 'GOOD', 'UNTIL', 'THRU', 'SINCE', 'PLATINUM', 'PLATINUF', 'PLATINUM', 'PLATINUF', 'PLATINUM', 'PLATINUF'
  ];
  // Clean the text and split into lines
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  let bestCandidate = null;
  let bestScore = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const words = line.split(/\s+/);
    // Must be at least 2 words, each at least 2 chars, all alphabetic (allow hyphens)
    if (words.length < 2) continue;
    if (!words.every(w => /^[A-Za-z-]{2,}$/.test(w))) continue;
    // Exclude lines with forbidden words or numbers
    if (words.some(w => forbiddenWords.includes(w.toUpperCase()))) continue;
    if (words.some(w => /\d/.test(w))) continue;
    // Exclude lines with more than 4 words (unlikely to be a name)
    if (words.length > 4) continue;
    // Exclude lines with words < 2 chars (except middle initials)
    if (words.filter(w => w.length === 1).length > 1) continue;
    // Score: +2 for all uppercase, +2 for title case, +1 for 2-3 words, +1 for being lower in the image
    let score = 0;
    if (line === line.toUpperCase()) score += 2;
    if (words.every(w => w[0] === w[0].toUpperCase())) score += 2;
    if (words.length === 2 || words.length === 3) score += 1;
    score += i; // lines lower in the image get higher index
    // Prefer lines with hyphens or middle initials
    if (words.some(w => w.length === 1)) score += 1;
    if (words.some(w => w.includes('-'))) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = line;
    }
  }
  if (bestCandidate) {
    // Remove forbidden/branding words from the result
    const words = bestCandidate.split(/\s+/);
    const filtered = words.filter(w => !forbiddenWords.includes(w.toUpperCase()));
    if (filtered.length >= 2) return filtered.join(' ');
    return bestCandidate;
  }
  // Try to find a line with two or more words, at least one matching a known name
  for (const line of lines) {
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.some(w => commonNames.includes(w.toUpperCase()))) {
      // Remove forbidden/branding words from the result
      const filtered = words.filter(w => !forbiddenWords.includes(w.toUpperCase()));
      if (filtered.length >= 2) return filtered.join(' ');
    }
  }
  // Relaxed fallback: pick the longest all-uppercase, 2+ word, all-alphabetic, not forbidden line
  let bestFallback = null;
  let bestFallbackScore = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const words = line.split(/\s+/);
    if (words.length < 2) continue;
    if (!words.every(w => /^[A-Za-z-]+$/.test(w))) continue;
    if (words.some(w => forbiddenWords.includes(w.toUpperCase()))) continue;
    let score = words.length * 2; // prefer more words
    if (line === line.toUpperCase()) score += 3; // prefer all uppercase
    score += i; // prefer lower lines
    if (score > bestFallbackScore) {
      bestFallbackScore = score;
      bestFallback = line;
    }
  }
  if (bestFallback) {
    const words = bestFallback.split(/\s+/);
    const filtered = words.filter(w => !forbiddenWords.includes(w.toUpperCase()));
    if (filtered.length >= 2) return filtered.join(' ');
    return bestFallback;
  }
  // Fallback: previous logic
  const namePatterns = [
    /^[A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/,
    /CARDHOLDER\s*:\s*([A-Z][a-z]+ [A-Z][a-z]+)/i,
    /^[A-Z][A-Z\s]+$/,
  ];
  let detectedName = null;
  for (const line of lines) {
    const match = line.match(/CARDHOLDER\s*:\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);
    if (match) {
      detectedName = match[1];
      break;
    }
  }
  if (!detectedName) {
    for (const line of lines) {
      if (line.length < 4 || /^\d+$/.test(line) || line.includes('CARD') || line.includes('BANK')) {
        continue;
      }
      for (const pattern of namePatterns) {
        if (pattern.test(line)) {
          const cleanName = line.replace(/\s+/g, ' ').trim();
          if (cleanName.length >= 4 && cleanName.length <= 50) {
            detectedName = cleanName;
            break;
          }
        }
      }
      if (detectedName) break;
    }
  }
  return detectedName;
}

// Crop the bottom 30% of the image and return the cropped file path
async function cropImageBottom(inputPath, outputPath, cropPercent = 0.3) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const height = metadata.height || 0;
  const cropHeight = Math.floor(height * cropPercent);
  const top = height - cropHeight;
  await image.extract({ left: 0, top, width: metadata.width, height: cropHeight }).toFile(outputPath);
  return outputPath;
}

// Preprocess the image: increase contrast, sharpen, and binarize (original settings)
async function preprocessImage(inputPath, outputPath) {
  await sharp(inputPath)
    .linear(1.5, -30)
    .sharpen()
    .threshold(128)
    .toFile(outputPath);
  return outputPath;
}

// Improved OCR function with card-specific settings for numbers
async function runOCRForNumbers(filepath) {
  let worker;
  try {
    worker = await createWorker('eng');
    
    // Configure OCR for better number recognition
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789 ', // Only recognize digits and spaces
      tessedit_pageseg_mode: '6', // Assume uniform block of text
      preserve_interword_spaces: '1',
    });
    
    const result = await worker.recognize(filepath);
    await worker.terminate();
    
    return {
      rawText: result.data.text,
      confidence: result.data.confidence,
      extractedNumbers: extractCardNumbers(result.data.text)
    };
  } catch (err) {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.error('Error terminating worker:', terminateError);
      }
    }
    throw err;
  }
}

// OCR function for text (including names)
async function runOCRForText(filepath) {
  let worker;
  try {
    worker = await createWorker('eng');
    
    // Configure OCR for better text recognition
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ', // Letters and spaces
      tessedit_pageseg_mode: '6', // Assume uniform block of text
      preserve_interword_spaces: '1',
    });
    
    const result = await worker.recognize(filepath);
    await worker.terminate();
    
    return {
      rawText: result.data.text,
      confidence: result.data.confidence,
      cardholderName: extractCardholderName(result.data.text)
    };
  } catch (err) {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.error('Error terminating worker:', terminateError);
      }
    }
    throw err;
  }
}

// Clean up file helper
async function cleanupFile(filepath) {
  try {
    await fs.unlink(filepath);
  } catch (error) {
    console.error('Error deleting file:', filepath, error);
  }
}

// Helper: check for valid card number format
function isValidCardNumberFormat(numbers) {
  // Accepts 13-19 digit numbers, optionally grouped in 4s
  const cardNumberRegex = /^(\d{4}[- ]?){3,4}\d{1,7}$|^\d{13,19}$/;
  return numbers.some(num => cardNumberRegex.test(num.replace(/\s|-/g, '')));
}

export default async function handler(req, res) {
  // Prevent multiple responses
  let responseHandled = false;
  
  const handleResponse = (statusCode, data) => {
    if (responseHandled) return;
    responseHandled = true;
    res.status(statusCode).json(data);
  };

  // Set up request timeout
  const timeoutId = setTimeout(() => {
    if (!responseHandled) {
      console.error('Request timed out');
      handleResponse(408, { error: 'Request timeout' });
    }
  }, 30000);

  try {
    if (req.method !== 'POST') {
      clearTimeout(timeoutId);
      return handleResponse(405, { error: 'Method not allowed' });
    }

    const form = new IncomingForm({ 
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024,
    });

    // Wrap form.parse in a Promise to handle it properly
    const parseForm = () => {
      return new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) {
            reject(err);
          } else {
            resolve({ fields, files });
          }
        });
      });
    };

    let uploadedFile = null;
    
    try {
      const { fields, files } = await parseForm();
      
      // Handle file
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      
      if (!file || !file.filepath) {
        clearTimeout(timeoutId);
        return handleResponse(400, { error: 'No file uploaded' });
      }

      uploadedFile = file.filepath;

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        await cleanupFile(uploadedFile);
        clearTimeout(timeoutId);
        return handleResponse(400, { 
          error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.' 
        });
      }

      // Run OCR for numbers
      let ocrResult;
      try {
        ocrResult = await runOCRForNumbers(file.filepath);
      } catch (ocrError) {
        console.error('OCR error:', ocrError);
        await cleanupFile(uploadedFile);
        clearTimeout(timeoutId);
        return handleResponse(500, { 
          error: 'OCR processing failed', 
          details: ocrError.message 
        });
      }

      // Crop image for name OCR
      const croppedPath = file.filepath + '-cropped.png';
      try {
        await cropImageBottom(file.filepath, croppedPath, 0.3);
      } catch (cropError) {
        console.error('Image cropping error:', cropError);
      }

      // Preprocess cropped image
      const preprocessedPath = croppedPath.replace('.png', '-pre.png');
      try {
        await preprocessImage(croppedPath, preprocessedPath);
      } catch (preError) {
        console.error('Image preprocessing error:', preError);
      }

      // Run OCR for text (including names) on preprocessed cropped image
      let textOcrResult;
      try {
        textOcrResult = await runOCRForText(preprocessedPath);
      } catch (textOcrError) {
        console.error('Text OCR error:', textOcrError);
        // Don't fail the entire request if text OCR fails
        textOcrResult = { rawText: '', confidence: 0, cardholderName: null };
      }

      // Clean up cropped and preprocessed files
      try {
        await cleanupFile(croppedPath);
        await cleanupFile(preprocessedPath);
      } catch (cleanupError) {
        console.error('Error cleaning up cropped/preprocessed file:', cleanupError);
      }

      // Extract potential last 4 digits
      const { digitGroups, allNumbers } = ocrResult.extractedNumbers;
      
      // Start with all digitGroups
      let last4Candidates = [...digitGroups];
      // Add last 4 of any long numbers (if not already present)
      allNumbers.forEach(num => {
        if (num.length >= 4) {
          const last4 = num.slice(-4);
          if (!last4Candidates.includes(last4)) last4Candidates.push(last4);
        }
      });
      // Remove duplicates
      last4Candidates = [...new Set(last4Candidates)];

      // Most likely last 4: last group in digitGroups
      const manualNameRequired = !textOcrResult.cardholderName || textOcrResult.cardholderName.length < 4;
      const cardNumberFormatValid = isValidCardNumberFormat(last4Candidates.concat(allNumbers || []));
      const response = {
        success: true,
        rawText: ocrResult.rawText.trim(),
        textRawText: textOcrResult.rawText.trim(),
        textLines: textOcrResult.rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0),
        confidence: ocrResult.confidence,
        textConfidence: textOcrResult.confidence,
        extractedNumbers: ocrResult.extractedNumbers,
        last4Candidates,
        detectedLast4: ocrResult.extractedNumbers.digitGroups.length > 0 ? ocrResult.extractedNumbers.digitGroups[3] : null,
        cardholderName: textOcrResult.cardholderName,
        manualNameRequired,
        cardNumberFormatValid,
        timestamp: new Date().toISOString()
      };

      // Clean up uploaded file
      await cleanupFile(uploadedFile);
      
      clearTimeout(timeoutId);
      return handleResponse(200, response);

    } catch (parseError) {
      console.error('Form parsing error:', parseError);
      if (uploadedFile) {
        await cleanupFile(uploadedFile);
      }
      clearTimeout(timeoutId);
      return handleResponse(400, { 
        error: 'File upload failed', 
        details: parseError.message 
      });
    }

  } catch (error) {
    console.error('Handler error:', error);
    clearTimeout(timeoutId);
    return handleResponse(500, { 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}