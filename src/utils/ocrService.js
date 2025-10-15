import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

// Google Cloud Vision API Key
const GOOGLE_CLOUD_VISION_API_KEY = 'AIzaSyBJyCyQrxafa5RHv5nlm-BCdUsqN-Gcrtg';

/**
 * Preprocess image for better OCR accuracy
 * - Resize to optimal dimensions
 * - Enhance contrast
 */
const preprocessImage = async (imageUri) => {
  try {
    console.log('OCR: Preprocessing image...');

    // Resize and optimize image for OCR
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        // Resize to max 1600px width to reduce API payload size
        { resize: { width: 1600 } }
      ],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    console.log('OCR: Image preprocessed successfully');
    return manipulatedImage.uri;
  } catch (error) {
    console.error('OCR: Image preprocessing failed, using original:', error);
    // Return original URI if preprocessing fails
    return imageUri;
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

    // Check if API key is configured
    if (!GOOGLE_CLOUD_VISION_API_KEY || GOOGLE_CLOUD_VISION_API_KEY === 'YOUR_API_KEY_HERE') {
      throw new Error('Google Cloud Vision API key not configured');
    }

    // Preprocess image for better OCR results
    const processedUri = await preprocessImage(imageUri);

    // Read image as base64
    console.log('OCR: Reading image file...');
    const base64Image = await FileSystem.readAsStringAsync(processedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Call Google Cloud Vision API
    console.log('OCR: Calling Google Cloud Vision API...');
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OCR: API error response:', errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('OCR: API response received');

    // Extract text from response
    if (result.responses && result.responses[0] && result.responses[0].textAnnotations) {
      const extractedText = result.responses[0].textAnnotations[0].description;
      console.log('OCR: Text extraction completed successfully');
      console.log('OCR: Detected text:', extractedText);
      return extractedText;
    }

    console.warn('OCR: No text detected in image');
    throw new Error('No text detected in image');
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
    console.log('Parsing text:', text);
    
    // Validate input
    if (!text || typeof text !== 'string') {
      console.warn('Invalid text input for parsing');
      return createFallbackEvent();
    }
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log('Text lines:', lines);
    
    // Look for multiple date patterns to identify multiple events
    const events = [];
    const dateMatches = findAllDates(text);
    console.log('Found dates:', dateMatches);
    
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
      } else if (lines.length > 0) {
        eventDetails.title = lines[0]; // Fallback to first line
      } else {
        eventDetails.title = 'New Event';
      }
      
      events.push(eventDetails);
    });
    
    console.log('Created events:', events);
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
    /(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/gi,
    // 24-hour format: 19:00, 1900
    /(\d{1,2}):(\d{2})/g,
  ];

  let closestTime = null;
  let closestDistance = Infinity;

  timePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const distance = Math.abs(match.index - datePosition);

      // Look for times within 200 characters of the date
      if (distance < 200 && distance < closestDistance) {
        closestDistance = distance;
        closestTime = parseTime(match);
      }
    }
  });

  return closestTime;
};

/**
 * Parse time from regex match
 */
const parseTime = (match) => {
  try {
    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3] ? match[3].toLowerCase() : null;

    if (meridiem) {
      // 12-hour format
      if (meridiem.startsWith('p') && hours !== 12) {
        hours += 12;
      } else if (meridiem.startsWith('a') && hours === 12) {
        hours = 0;
      }
    }

    // Validate time
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes };
    }
  } catch (error) {
    console.log('Error parsing time:', error);
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