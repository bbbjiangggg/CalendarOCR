import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { log, warn, error as logError } from './logger';
import { APP_API_KEY } from './config';
import { parseEventDetails } from './eventParsing';

// Re-export so existing importers of parseEventDetails from this module keep working.
export { parseEventDetails };

// Backend API URLs - Your Vercel deployment
const BACKEND_API_URL = 'https://calendar-ocr-backend.vercel.app/api/ocr';
const PARSE_EVENT_API_URL = 'https://calendar-ocr-backend.vercel.app/api/parse-event';

/**
 * Typed error so the UI can distinguish failure modes (network vs. no-text vs.
 * server) and show an appropriate, actionable message instead of a blank card.
 */
export const OCR_ERROR = {
  NETWORK: 'network',   // couldn't reach the backend
  SERVER: 'server',     // backend responded with an error
  NO_TEXT: 'no_text',   // OCR succeeded but found no readable text
  INVALID: 'invalid',   // bad input / unexpected response
};

const ocrError = (type, message) => Object.assign(new Error(message), { type, isOcrError: true });

/**
 * Preprocess image for better OCR accuracy.
 *
 * We intentionally do NOT crop here. The camera's focus frame is screen-relative
 * (a CSS overlay), while the captured photo has the sensor's aspect ratio — so a
 * screen-percentage crop misaligns and can cut off the poster. Sending the full
 * (resized) frame lets the OCR + GPT pipeline handle framing far more reliably.
 * The on-screen frame remains purely as capture guidance for the user.
 */
const preprocessImage = async (imageUri) => {
  try {
    log('OCR: Preprocessing image (resize + compress, no crop)...');
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      // Resize to max 1600px width to reduce API payload size
      [{ resize: { width: 1600 } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    log(`OCR: ✓ Preprocessed to ${manipulatedImage.width}×${manipulatedImage.height}`);
    return manipulatedImage.uri;
  } catch (err) {
    // Non-fatal: fall back to the original image so OCR can still be attempted.
    warn('OCR: Preprocessing failed, using original image:', err.message);
    return imageUri;
  }
};

/**
 * Extract text from image using Vision API
 */
export const extractTextFromImage = async (imageUri) => {
  log('OCR: Processing image for text extraction');

  // Validate input
  if (!imageUri || typeof imageUri !== 'string') {
    throw ocrError(OCR_ERROR.INVALID, 'Invalid image URI provided');
  }

  // Preprocess image for better OCR results
  const processedUri = await preprocessImage(imageUri);

  // Read image as base64
  const base64Image = await FileSystem.readAsStringAsync(processedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Call backend API
  log('OCR: Calling backend API...');
  let response;
  try {
    response = await fetch(BACKEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-key': APP_API_KEY,
      },
      body: JSON.stringify({
        image: base64Image,
      }),
    });
  } catch (err) {
    // fetch() only rejects on network-level failures (no connectivity, DNS, etc.)
    logError('OCR: Network error calling backend:', err.message);
    throw ocrError(OCR_ERROR.NETWORK, 'Could not reach the server. Check your connection.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    logError('OCR: Backend API error:', response.status, errorText);
    throw ocrError(OCR_ERROR.SERVER, `The server could not process the image (${response.status}).`);
  }

  const result = await response.json();
  log('OCR: ✓ Backend response received');

  // Extract text from backend response
  if (result.success && result.text !== undefined) {
    const extractedText = result.text;
    if (extractedText) {
      log(`OCR: ✓ Text extraction completed (${extractedText.length} chars)`);
    } else {
      warn('OCR: No text detected in image');
    }
    return extractedText;
  }

  warn('OCR: Invalid response format from backend');
  throw ocrError(OCR_ERROR.SERVER, 'Received an unexpected response from the server.');
};

/**
 * Extract text from image and parse it into structured event data using GPT-4o-mini
 * This is the new AI-powered pipeline that replaces regex-based parsing
 */
export const extractAndParseEvent = async (imageUri) => {
  try {
    log('===== STARTING GPT-POWERED EVENT EXTRACTION =====');
    log('GPT Pipeline: Processing image:', imageUri);

    // Step 1: Extract raw text using Vision API
    log('GPT Pipeline: Step 1 - Extracting text via Vision API...');
    const rawText = await extractTextFromImage(imageUri);

    if (!rawText || rawText.trim().length === 0) {
      warn('GPT Pipeline: No text extracted from image');
      throw ocrError(OCR_ERROR.NO_TEXT, "We couldn't find any text on this poster.");
    }

    log('GPT Pipeline: ✓ Text extraction successful');
    log(`GPT Pipeline: Extracted ${rawText.length} characters of text`);

    // Step 2: Parse event details using GPT-4o-mini
    try {
      log('GPT Pipeline: Step 2 - Calling GPT-4o-mini for structured parsing...');

      // Send the user's LOCAL date so the backend can resolve relative dates
      // ("this Friday", "tonight") against the right day/timezone.
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      const response = await fetch(PARSE_EVENT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-key': APP_API_KEY,
        },
        body: JSON.stringify({
          text: rawText,
          today: localToday,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logError('GPT Pipeline: Backend API error:', response.status, errorText);
        throw new Error(`GPT parsing API failed: ${response.status}`);
      }

      const result = await response.json();
      log('GPT Pipeline: ✓ GPT parsing response received');

      // Handle both new format (events array) and old format (single event)
      let eventsData = [];

      if (result.success && result.events && Array.isArray(result.events)) {
        // New format: multiple events
        eventsData = result.events;
        log(`GPT Pipeline: ✓ Successfully parsed ${eventsData.length} event(s)`);
      } else if (result.success && result.event) {
        // Old format: single event (backward compatibility)
        eventsData = [result.event];
        log('GPT Pipeline: ✓ Successfully parsed event details (legacy format)');
      } else {
        logError('GPT Pipeline: Invalid response format from GPT API:', result);
        throw new Error('Invalid response from GPT parsing API');
      }

      // Process each event
      const parsedEvents = [];

      for (let i = 0; i < eventsData.length; i++) {
        const eventData = eventsData[i];
        log(`GPT Pipeline: Processing event ${i + 1}/${eventsData.length}:`, {
          title: eventData.title,
          date: eventData.date,
          time: eventData.time,
          endTime: eventData.endTime || eventData.end_time || '(empty)',
          location: eventData.location ? `"${eventData.location}"` : '(empty)',
          description: eventData.description ? `"${eventData.description.substring(0, 50)}..."` : '(empty)',
          duration: eventData.duration || '(empty)'
        });

        try {
          // Step 3: Convert GPT response (ISO date/time strings) to JavaScript Date object
          log(`GPT Pipeline: Converting ISO date/time to Date object for event ${i + 1}...`);

          // Combine date and time: "2024-12-25" + "14:30" -> "2024-12-25T14:30"
          const dateTimeString = `${eventData.date}T${eventData.time}`;
          const eventDate = new Date(dateTimeString);

          // Validate the date
          if (isNaN(eventDate.getTime())) {
            logError(`GPT Pipeline: Invalid date/time from GPT for event ${i + 1}:`, dateTimeString);
            continue; // Skip this event
          }

          log(`GPT Pipeline: ✓ Date conversion successful for event ${i + 1}:`, eventDate.toLocaleString());

          // Step 4: Calculate duration from start and end time if available
          let calculatedDuration = eventData.duration || '60'; // Default to 60 minutes

          const endTime = eventData.endTime || eventData.end_time;
          if (endTime && !eventData.duration) {
            log(`GPT Pipeline: End time detected for event ${i + 1}, calculating duration...`);
            try {
              // Parse start time (HH:MM format)
              const [startHour, startMinute] = eventData.time.split(':').map(Number);
              // Parse end time (HH:MM format)
              const [endHour, endMinute] = endTime.split(':').map(Number);

              // Calculate total minutes from midnight for both times
              const startTotalMinutes = startHour * 60 + startMinute;
              const endTotalMinutes = endHour * 60 + endMinute;

              // Calculate duration in minutes
              let durationMinutes = endTotalMinutes - startTotalMinutes;

              // Handle cases where event crosses midnight (end time is next day)
              if (durationMinutes < 0) {
                durationMinutes += 24 * 60; // Add 24 hours
              }

              // Validate reasonable duration (between 5 minutes and 24 hours)
              if (durationMinutes >= 5 && durationMinutes <= 1440) {
                calculatedDuration = String(durationMinutes);
                log(`GPT Pipeline: ✓ Calculated duration for event ${i + 1}: ${durationMinutes} minutes (${eventData.time} to ${endTime})`);
              } else {
                warn(`GPT Pipeline: Calculated duration ${durationMinutes} min seems unreasonable, using default`);
              }
            } catch (error) {
              logError(`GPT Pipeline: Error calculating duration for event ${i + 1}:`, error);
              log('GPT Pipeline: Using default duration');
            }
          }

          // Step 5: Create event object
          const parsedEvent = {
            title: eventData.title,
            date: eventDate,
            location: eventData.location || '',
            description: eventData.description || '',
            duration: calculatedDuration,
            notification: '1hr'
          };

          parsedEvents.push(parsedEvent);
          log(`GPT Pipeline: ✓ Event ${i + 1} processed successfully. Final duration: ${calculatedDuration} minutes`);

        } catch (eventError) {
          logError(`GPT Pipeline: Error processing event ${i + 1}:`, eventError);
          // Continue with next event
        }
      }

      if (parsedEvents.length === 0) {
        logError('GPT Pipeline: No valid events could be parsed');
        throw new Error('No valid events in response');
      }

      log('GPT Pipeline: ===== GPT PARSING COMPLETE - SUCCESS =====');
      log(`GPT Pipeline: Successfully processed ${parsedEvents.length} event(s)`);
      return parsedEvents; // Return array of parsed events

    } catch (gptError) {
      logError('GPT Pipeline: ✗ GPT parsing failed:', gptError.message);
      logError('GPT Pipeline: Full error:', gptError);
      log('GPT Pipeline: ⚠️  FALLBACK: Using regex-based parsing instead...');

      // Fallback to regex-based parsing if GPT fails
      const regexResult = parseEventDetails(rawText);
      log('GPT Pipeline: Regex parsing fallback completed');
      return regexResult;
    }

  } catch (err) {
    // Surface known OCR failures to the UI so it can show an actionable message
    // and a retry, rather than silently dropping the user into a blank event.
    if (err && err.isOcrError) {
      throw err;
    }
    logError('GPT Pipeline: ✗ Critical error in extractAndParseEvent:', err.message);
    throw ocrError(OCR_ERROR.INVALID, 'Something went wrong reading this poster.');
  }
};

