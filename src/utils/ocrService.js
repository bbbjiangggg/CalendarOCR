import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { log, warn, error as logError } from './logger';
import { APP_API_KEY } from './config';
import { parseEventDetails } from './eventParsing';
import { scanWithWind } from './windService';

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
  WIND_RECONNECT: 'wind_reconnect', // Wind token died — user must reconnect
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
 * Convert raw parsed events — { title, date, time, duration?, endTime?/end_time?,
 * location?, description? } — into the app's event objects: a real Date, a
 * resolved duration (explicit value wins, else derived from an end time), and
 * defaults. Invalid rows are skipped. Shared by the GPT (flat) path and the
 * Wind scan path so both produce identical shapes downstream.
 */
export const normalizeParsedEvents = (eventsData) => {
  const parsedEvents = [];

  for (let i = 0; i < eventsData.length; i++) {
    const eventData = eventsData[i];
    try {
      // Combine date + time ("2024-12-25" + "14:30" -> "2024-12-25T14:30").
      const dateTimeString = `${eventData.date}T${eventData.time}`;
      const eventDate = new Date(dateTimeString);
      if (isNaN(eventDate.getTime())) {
        logError(`Event normalize: invalid date/time for event ${i + 1}:`, dateTimeString);
        continue; // Skip this event
      }

      // Duration: an explicit value wins; otherwise derive it from an end time.
      let calculatedDuration = eventData.duration || '60'; // Default to 60 minutes
      const endTime = eventData.endTime || eventData.end_time;
      if (endTime && !eventData.duration) {
        try {
          const [startHour, startMinute] = eventData.time.split(':').map(Number);
          const [endHour, endMinute] = endTime.split(':').map(Number);
          let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
          if (durationMinutes < 0) durationMinutes += 24 * 60; // event crosses midnight
          // Only trust a sane span (5 min – 24 h); otherwise keep the default.
          if (durationMinutes >= 5 && durationMinutes <= 1440) {
            calculatedDuration = String(durationMinutes);
          } else {
            warn(`Event normalize: duration ${durationMinutes}min unreasonable, using default`);
          }
        } catch (err) {
          logError(`Event normalize: duration calc failed for event ${i + 1}:`, err?.message);
        }
      }

      parsedEvents.push({
        title: eventData.title,
        date: eventDate,
        location: eventData.location || '',
        description: eventData.description || '',
        duration: calculatedDuration,
        notification: '1hr',
      });
    } catch (eventError) {
      logError(`Event normalize: error processing event ${i + 1}:`, eventError?.message);
      // Continue with the next event
    }
  }

  return parsedEvents;
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
export const extractAndParseEvent = async (imageUri, onProgress) => {
  // Report a pipeline stage to the UI loader (no-op if no callback / on error).
  const report = (stage) => {
    try {
      if (onProgress) onProgress(stage);
    } catch (e) {
      // progress reporting must never break the pipeline
    }
  };

  try {
    log('===== STARTING GPT-POWERED EVENT EXTRACTION =====');
    log('GPT Pipeline: Processing image:', imageUri);

    // Step 1: Extract raw text using Vision API
    report('analyzing');
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
      report('extracting');
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
      report('organizing');
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

      // Normalize into the app's event objects (shared with the Wind path).
      const parsedEvents = normalizeParsedEvents(eventsData);

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

/**
 * Wind (pay-as-you-go) scan pipeline. One multimodal call to /api/scan-wind does
 * OCR + parsing at once, billed to the user's Wind wallet. Returns
 * { events, wind } where `events` is the SAME array shape extractAndParseEvent
 * returns (so the editor is identical) and `wind` is the billing receipt
 * ({ user_charge_mc, ... }) for display. Throws an ocrError on failure; a dead
 * connection surfaces as OCR_ERROR.WIND_RECONNECT so the UI can prompt a
 * reconnect instead of a generic error.
 */
export const extractAndParseEventWind = async (imageUri, onProgress, { idempotencyKey } = {}) => {
  const report = (stage) => {
    try {
      if (onProgress) onProgress(stage);
    } catch (e) {
      // progress reporting must never break the pipeline
    }
  };

  try {
    log('===== STARTING WIND SCAN (pay-as-you-go) =====');
    if (!imageUri || typeof imageUri !== 'string') {
      throw ocrError(OCR_ERROR.INVALID, 'Invalid image URI provided');
    }

    // Same preprocessing as the flat path: resize/compress, no crop.
    report('analyzing');
    const processedUri = await preprocessImage(imageUri);
    const base64Image = await FileSystem.readAsStringAsync(processedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Send the user's LOCAL date so relative dates resolve correctly.
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    report('extracting');
    log('Wind scan: calling /api/scan-wind...');
    let data;
    try {
      data = await scanWithWind({ image: base64Image, today: localToday, idempotencyKey });
    } catch (err) {
      if (err?.code === 'wind_reconnect_required') {
        throw ocrError(OCR_ERROR.WIND_RECONNECT, 'Your Wind connection expired. Reconnect to keep paying as you go.');
      }
      if (err?.windNetwork) {
        throw ocrError(OCR_ERROR.NETWORK, 'Could not reach the server. Check your connection.');
      }
      if (err?.status === 422) {
        throw ocrError(OCR_ERROR.NO_TEXT, "We couldn't find an event on this poster.");
      }
      throw ocrError(OCR_ERROR.SERVER, err?.message || 'The server could not process the image.');
    }

    report('organizing');
    const parsedEvents = normalizeParsedEvents(Array.isArray(data.events) ? data.events : []);
    if (parsedEvents.length === 0) {
      throw ocrError(OCR_ERROR.NO_TEXT, "We couldn't find an event on this poster.");
    }

    log(`Wind scan: ✓ ${parsedEvents.length} event(s), charge ${data.wind?.user_charge_mc ?? '?'} mc`);
    return { events: parsedEvents, wind: data.wind || null };
  } catch (err) {
    if (err && err.isOcrError) throw err;
    logError('Wind scan: ✗ critical error:', err?.message);
    throw ocrError(OCR_ERROR.INVALID, 'Something went wrong reading this poster.');
  }
};

