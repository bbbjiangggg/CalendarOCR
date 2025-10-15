import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Image } from 'react-native';

// Backend API URL - Your Vercel deployment
const BACKEND_API_URL = 'https://calendar-ocr-backend.vercel.app/api/ocr';

// Focus frame coordinates matching the camera UI
// These match the focusArea in CameraScreen.js (top:20%, left:10%, right:10%, bottom:30%)
const FOCUS_FRAME = {
  top: 0.20,      // 20% from top
  left: 0.10,     // 10% from left
  width: 0.80,    // 80% of screen width (100% - 10% - 10%)
  height: 0.50    // 50% of screen height (100% - 20% - 30%)
};

/**
 * Get image dimensions
 */
const getImageDimensions = (uri) => {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
};

/**
 * Preprocess image for better OCR accuracy
 * - Crop to focus frame area (removes surrounding posters)
 * - Resize to optimal dimensions
 * - Compress for faster upload
 */
const preprocessImage = async (imageUri) => {
  try {
    console.log('OCR: ===== STARTING IMAGE PREPROCESSING =====');
    console.log('OCR: Input image URI:', imageUri);

    // Get original image dimensions
    console.log('OCR: Fetching image dimensions...');
    const { width: imageWidth, height: imageHeight } = await getImageDimensions(imageUri);
    console.log(`OCR: ✓ Original image dimensions: ${imageWidth}×${imageHeight} (aspect ratio: ${(imageWidth/imageHeight).toFixed(2)})`);

    // Calculate crop region based on focus frame
    const cropRegion = {
      originX: Math.round(imageWidth * FOCUS_FRAME.left),
      originY: Math.round(imageHeight * FOCUS_FRAME.top),
      width: Math.round(imageWidth * FOCUS_FRAME.width),
      height: Math.round(imageHeight * FOCUS_FRAME.height)
    };

    console.log('OCR: Focus frame settings:', FOCUS_FRAME);
    console.log(`OCR: ✓ Calculated crop region:`, cropRegion);
    console.log(`OCR:   - Cropping from (${cropRegion.originX}, ${cropRegion.originY})`);
    console.log(`OCR:   - New size: ${cropRegion.width}×${cropRegion.height}`);
    console.log(`OCR:   - This removes ${((1 - FOCUS_FRAME.width * FOCUS_FRAME.height) * 100).toFixed(1)}% of the image`);

    // Apply crop and resize operations
    console.log('OCR: Applying crop and resize...');
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        // Step 1: Crop to focus frame area (removes surrounding content)
        { crop: cropRegion },
        // Step 2: Resize to max 1600px width to reduce API payload size
        { resize: { width: 1600 } }
      ],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    console.log('OCR: ✓ Image preprocessed successfully!');
    console.log(`OCR:   - Cropped image URI: ${manipulatedImage.uri}`);
    console.log(`OCR:   - Final dimensions: ${manipulatedImage.width}×${manipulatedImage.height}`);
    console.log('OCR: ===== PREPROCESSING COMPLETE =====');

    return manipulatedImage.uri;
  } catch (error) {
    console.error('OCR: ✗ Image preprocessing FAILED:', error);
    console.error('OCR: Error name:', error.name);
    console.error('OCR: Error message:', error.message);
    console.error('OCR: Error stack:', error.stack);
    console.warn('OCR: ⚠️  FALLBACK: Attempting without cropping...');

    // Fallback: Try without cropping
    try {
      const fallbackImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1600 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      console.log('OCR: ✓ Fallback preprocessing successful (resize only - NO CROPPING APPLIED)');
      console.warn('OCR: ⚠️  WARNING: Full image sent to OCR, may see other posters!');
      return fallbackImage.uri;
    } catch (fallbackError) {
      console.error('OCR: ✗ Fallback preprocessing also failed:', fallbackError);
      console.error('OCR: Using original image without any processing');
      return imageUri;
    }
  }
};

/**
 * Extract text from image using Google Cloud Vision API
 */
export const extractTextFromImage = async (imageUri) => {
  try {
    console.log('OCR: Processing image for text extraction:', imageUri);

    // Validate input
    if (!imageUri || typeof imageUri !== 'string') {
      throw new Error('Invalid image URI provided');
    }

    // Check if backend URL is configured
    if (!BACKEND_API_URL || BACKEND_API_URL === 'YOUR_VERCEL_URL_HERE/api/ocr') {
      throw new Error('Backend API URL not configured. Please deploy the backend and update BACKEND_API_URL in ocrService.js');
    }

    // Preprocess image for better OCR results
    const processedUri = await preprocessImage(imageUri);

    // Read image as base64
    console.log('OCR: Reading image file...');
    const base64Image = await FileSystem.readAsStringAsync(processedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Call backend API
    console.log('OCR: Calling backend API...');
    const response = await fetch(BACKEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OCR: Backend API error:', response.status, errorText);
      throw new Error(`Backend API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('OCR: ✓ Backend response received');

    // Extract text from backend response
    if (result.success && result.text !== undefined) {
      const extractedText = result.text;

      if (extractedText) {
        console.log('OCR: ✓ Text extraction completed successfully');
        console.log('OCR: ===== EXTRACTED TEXT START =====');
        console.log(extractedText);
        console.log('OCR: ===== EXTRACTED TEXT END =====');
        console.log(`OCR: Total characters: ${extractedText.length}, Total lines: ${extractedText.split('\n').length}`);
      } else {
        console.warn('OCR: ⚠️  No text detected in image');
      }

      return extractedText;
    }

    console.warn('OCR: Invalid response format from backend');
    throw new Error('Invalid response from backend');
  } catch (error) {
    console.error('OCR Error details:', error);
    console.error('OCR Error message:', error.message);

    // Return empty string to trigger manual entry
    // The EventEditorScreen will handle this gracefully
    console.log('OCR: Returning empty string due to error');
    return '';
  }
};

export const parseEventDetails = (text) => {
  try {
    console.log('===== STARTING EVENT PARSING =====');
    console.log('Parsing text:', text);

    // Validate input
    if (!text || typeof text !== 'string') {
      console.warn('Invalid text input for parsing');
      return createFallbackEvent();
    }

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log(`Found ${lines.length} text lines:`, lines);

    // Look for multiple date patterns to identify multiple events
    const events = [];
    const dateMatches = findAllDates(text);
    console.log(`Found ${dateMatches.length} date(s):`, dateMatches.map(d => ({
      date: d.date.toLocaleString(),
      hasTime: d.hasTime,
      originalText: d.originalText
    })));

    if (dateMatches.length === 0) {
      // No dates found, create single event with manual entry
      console.log('No dates found, creating default event');
      return [{
        title: lines.length > 0 ? lines[0] : 'New Event',
        date: new Date(),
        location: '',
        description: lines.slice(1).join(' '),
        notification: '1hr'
      }];
    }

    // For each date found, try to create an event
    dateMatches.forEach((dateMatch, index) => {
      if (!dateMatch || !dateMatch.date) {
        console.warn('Invalid date match found:', dateMatch);
        return;
      }

      console.log(`\nProcessing event ${index + 1}:`);
      console.log(`  Date: ${dateMatch.date.toLocaleString()}`);
      console.log(`  Has time: ${dateMatch.hasTime}`);

      const eventDetails = {
        title: '',
        date: dateMatch.date,
        location: '',
        description: '',
        notification: '1hr'
      };

      // Try to find title near this date
      const titleCandidate = findTitleNearDate(lines, dateMatch.originalText);
      if (titleCandidate) {
        eventDetails.title = titleCandidate;
        console.log(`  Title (found): "${titleCandidate}"`);
      } else if (lines.length > 0) {
        eventDetails.title = lines[0]; // Fallback to first line
        console.log(`  Title (fallback): "${lines[0]}"`);
      } else {
        eventDetails.title = 'New Event';
        console.log(`  Title (default): "New Event"`);
      }

      events.push(eventDetails);
    });

    console.log('\n===== EVENT PARSING COMPLETE =====');
    console.log(`Created ${events.length} event(s):`, events.map(e => ({
      title: e.title,
      date: e.date.toLocaleString(),
      time: `${e.date.getHours()}:${String(e.date.getMinutes()).padStart(2, '0')}`
    })));

    return events.length > 0 ? events : createFallbackEvent();
  } catch (error) {
    console.error('Error parsing event details:', error);
    return createFallbackEvent();
  }
};

const createFallbackEvent = () => {
  return [{
    title: 'New Event',
    date: new Date(),
    location: '',
    description: '',
    notification: '1hr'
  }];
};

/**
 * Extract times from text and associate them with dates
 */
const findTimesNearDate = (text, datePosition) => {
  const timePatterns = [
    // 12-hour format: 7:00 PM, 7PM, 7:00pm
    { pattern: /(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/gi, name: '12-hour' },
    // 24-hour format: 19:00, 1900 (only match if NOT followed by AM/PM)
    { pattern: /(\d{1,2}):(\d{2})(?!\s*(?:am|pm|a\.m\.|p\.m\.))/gi, name: '24-hour' },
  ];

  let closestTime = null;
  let closestDistance = Infinity;
  let closestMatch = null;

  timePatterns.forEach(({ pattern, name }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const distance = Math.abs(match.index - datePosition);

      console.log(`Time parsing: Found ${name} match "${match[0]}" at position ${match.index}, distance from date: ${distance}`);

      // Look for times within 200 characters of the date
      if (distance < 200 && distance < closestDistance) {
        const parsedTime = parseTime(match, name);
        if (parsedTime) {
          console.log(`Time parsing: Parsed as ${parsedTime.hours}:${String(parsedTime.minutes).padStart(2, '0')} (${parsedTime.hours >= 12 ? 'PM' : 'AM'})`);
          closestDistance = distance;
          closestTime = parsedTime;
          closestMatch = match[0];
        }
      }
    }
  });

  if (closestTime) {
    console.log(`Time parsing: Selected closest time "${closestMatch}": ${closestTime.hours}:${String(closestTime.minutes).padStart(2, '0')}`);
  } else {
    console.log('Time parsing: No time found near date');
  }

  return closestTime;
};

/**
 * Parse time from regex match
 */
const parseTime = (match, patternName) => {
  try {
    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3] ? match[3].toLowerCase() : null;

    console.log(`Time parsing [${patternName}]: Raw match - hours:${hours}, minutes:${minutes}, meridiem:${meridiem || 'none'}`);

    if (meridiem) {
      // 12-hour format
      const originalHours = hours;
      if (meridiem.startsWith('p') && hours !== 12) {
        hours += 12;
        console.log(`Time parsing: Converting ${originalHours}PM to ${hours} (24-hour)`);
      } else if (meridiem.startsWith('a') && hours === 12) {
        hours = 0;
        console.log(`Time parsing: Converting 12AM to 0 (24-hour)`);
      } else {
        console.log(`Time parsing: Keeping ${hours} (already correct for ${meridiem.toUpperCase()})`);
      }
    }

    // Validate time
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes };
    } else {
      console.warn(`Time parsing: Invalid time - hours:${hours}, minutes:${minutes}`);
    }
  } catch (error) {
    console.error('Time parsing error:', error);
  }

  return null;
};

const findAllDates = (text) => {
  const dateMatches = [];

  const datePatterns = [
    // MM/DD/YYYY or MM-DD-YYYY
    { pattern: /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g, type: 'numeric' },
    // Month DD, YYYY
    { pattern: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/gi, type: 'monthFirst' },
    // DD Month YYYY
    { pattern: /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/gi, type: 'dayFirst' },
    // Month DD (current year)
    { pattern: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/gi, type: 'monthOnly' },
    // Abbreviated months: Dec 15, 2024 or 15 Dec 2024
    { pattern: /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi, type: 'abbrMonthFirst' },
    { pattern: /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/gi, type: 'abbrDayFirst' },
  ];

  datePatterns.forEach(({ pattern, type }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const parsedDate = parseDate(match, type);
      if (parsedDate) {
        // Try to find time near this date
        const timeInfo = findTimesNearDate(text, match.index);

        // Apply time to date if found
        if (timeInfo) {
          parsedDate.setHours(timeInfo.hours, timeInfo.minutes, 0, 0);
        }

        dateMatches.push({
          date: parsedDate,
          originalText: match[0],
          position: match.index,
          hasTime: timeInfo !== null
        });
      }
    }
  });

  return dateMatches;
};

const findTitleNearDate = (lines, dateText) => {
  // Simple heuristic: look for the first meaningful line that's not the date
  for (const line of lines) {
    if (!line.toLowerCase().includes(dateText.toLowerCase()) && line.length > 3) {
      return line;
    }
  }
  return null;
};

const parseDate = (match, type) => {
  const currentYear = new Date().getFullYear();

  const monthNames = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  try {
    switch (type) {
      case 'numeric':
        // MM/DD/YYYY or MM-DD-YYYY
        const month = parseInt(match[1]) - 1;
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        return new Date(year, month, day);

      case 'monthFirst':
      case 'abbrMonthFirst':
        // Month DD, YYYY or Dec 15, 2024
        const monthName1 = match[1].toLowerCase().replace(/\./g, '');
        const month1 = monthNames[monthName1];
        const day1 = parseInt(match[2]);
        const year1 = parseInt(match[3]);
        if (month1 !== undefined) {
          return new Date(year1, month1, day1);
        }
        break;

      case 'dayFirst':
      case 'abbrDayFirst':
        // DD Month YYYY or 15 Dec 2024
        const day2 = parseInt(match[1]);
        const monthName2 = match[2].toLowerCase().replace(/\./g, '');
        const month2 = monthNames[monthName2];
        const year2 = parseInt(match[3]);
        if (month2 !== undefined) {
          return new Date(year2, month2, day2);
        }
        break;

      case 'monthOnly':
        // Month DD (current year)
        const monthName3 = match[1].toLowerCase();
        const month3 = monthNames[monthName3];
        const day3 = parseInt(match[2]);
        if (month3 !== undefined) {
          return new Date(currentYear, month3, day3);
        }
        break;
    }
  } catch (error) {
    console.log('Error parsing date:', error);
  }

  return null;
};