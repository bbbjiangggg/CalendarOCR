# CalendarOCR - Development Notes & Architecture

## 📋 Table of Contents
- [Project Overview](#project-overview)
- [Current Architecture](#current-architecture)
- [Frontend Structure](#frontend-structure)
- [Backend Structure](#backend-structure)
- [OCR Pipeline](#ocr-pipeline)
- [Recent Changes](#recent-changes)
- [Known Issues](#known-issues)
- [Next Steps](#next-steps)
- [Testing Checklist](#testing-checklist)

---

## 📱 Project Overview

**CalendarOCR** is a React Native mobile app that converts event posters into calendar entries using OCR and AI.

### Tech Stack
- **Frontend:** React Native + Expo SDK 52
- **Backend:** Vercel Serverless Functions (Node.js)
- **OCR:** Google Cloud Vision API
- **Planned:** GPT-4o-mini for structured data extraction
- **Build System:** EAS (Expo Application Services)
- **Platform:** iOS (iPhone) - Android support planned

### Key Features
- Camera-based poster scanning with focus frame UI
- OCR text extraction from event posters
- Automatic date/time parsing (multiple formats)
- Event detail extraction (title, date, location, description)
- Calendar integration with notifications
- Single event creation workflow

---

## 🏗️ Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CalendarOCR App (iOS)                   │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ CameraScreen │ -> │ OCR Service  │ -> │ EventEditor  │ │
│  │  (Take pic)  │    │ (Process)    │    │  (Review)    │ │
│  └──────────────┘    └──────┬───────┘    └──────────────┘ │
│                              │                              │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               │ HTTPS POST (base64 image)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Vercel Backend (Serverless)                    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /api/ocr.js                                         │  │
│  │  - Receives base64 image                            │  │
│  │  - Calls Google Cloud Vision API                    │  │
│  │  - Returns extracted text                           │  │
│  │  - API key secured server-side (env var)           │  │
│  └──────────────────┬───────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────┘
                      │
                      │ Google Cloud Vision API
                      ▼
            ┌──────────────────────┐
            │  Google Cloud Vision │
            │  TEXT_DETECTION      │
            └──────────────────────┘
```

---

## 📂 Frontend Structure

### Repository: `/Users/bowenjiang/Desktop/CalendarOCR/`

```
CalendarOCR/
├── App.js                          # Root component, navigation setup
├── app.json                        # Expo configuration
├── package.json                    # Dependencies
├── eas.json                        # EAS Build configuration
│
├── src/
│   ├── screens/
│   │   ├── CameraScreen.js         # Camera UI with focus frame
│   │   ├── EventEditorScreen.js    # Review/edit parsed event
│   │   └── CalendarScreen.js       # Calendar view with events
│   │
│   ├── utils/
│   │   └── ocrService.js           # ⭐ CORE: OCR + parsing logic
│   │
│   ├── contexts/
│   │   └── EventContext.js         # Global event state management
│   │
│   └── components/
│       └── (UI components)
│
└── DEVELOPMENT_NOTES.md            # This file
```

### Key Files

#### **App.js** (`/App.js`)
- React Navigation setup (Stack Navigator)
- Routes: Camera → EventEditor → Calendar
- EventContext provider wrapper
- No direct OCR logic

#### **CameraScreen.js** (`/src/screens/CameraScreen.js`)
- Expo Camera implementation
- **Focus frame UI:** `top:20%, left:10%, right:10%, bottom:30%`
- Takes photo, passes URI to EventEditorScreen
- **Important:** Focus frame is VISUAL ONLY until cropping is applied

#### **EventEditorScreen.js** (`/src/screens/EventEditorScreen.js`)
- Receives photo URI from CameraScreen
- Calls `extractTextFromImage()` from ocrService
- Calls `parseEventDetails()` to parse text into structured data
- Shows form to review/edit event details
- Saves to calendar via EventContext

#### **ocrService.js** (`/src/utils/ocrService.js`) ⭐
**THE CORE FILE** - Contains all OCR and parsing logic:

**Functions:**
1. `getImageDimensions(uri)` - Uses React Native Image.getSize() to fetch dimensions
2. `preprocessImage(imageUri)` - Crops to focus frame + resizes + compresses
3. `extractTextFromImage(imageUri)` - Calls backend API, returns raw text
4. `parseEventDetails(text)` - Parses text into event objects
5. `findAllDates(text)` - Regex-based date extraction (7+ formats)
6. `findTimesNearDate(text, datePosition)` - Finds times within 200 chars of date
7. `parseTime(match, patternName)` - Converts 12/24-hour to 24-hour format
8. `findTitleNearDate(lines, dateText)` - Heuristic title extraction

**Constants:**
- `BACKEND_API_URL`: `https://calendar-ocr-backend.vercel.app/api/ocr`
- `FOCUS_FRAME`: `{ top: 0.20, left: 0.10, width: 0.80, height: 0.50 }`

**Supported Date Formats:**
- MM/DD/YYYY, MM-DD-YYYY (e.g., 12/25/2024)
- Month DD, YYYY (e.g., December 25, 2024)
- DD Month YYYY (e.g., 25 December 2024)
- Month DD (current year) (e.g., December 25)
- Abbreviated: Dec 15, 2024 / 15 Dec 2024

**Supported Time Formats:**
- 12-hour: 7:00 PM, 7PM, 7:00pm
- 24-hour: 19:00, 13:45

#### **EventContext.js** (`/src/contexts/EventContext.js`)
- React Context + useReducer for global state
- Stores all events in-memory
- Actions: ADD_EVENT, UPDATE_EVENT, DELETE_EVENT
- Used by Calendar and EventEditor screens

---

## 🔧 Backend Structure

### Repository: `/Users/bowenjiang/Desktop/CalendarOCR-backend/`

```
CalendarOCR-backend/
├── api/
│   └── ocr.js                  # ⭐ Main OCR endpoint
├── package.json                # Dependencies (@google-cloud/vision)
├── vercel.json                 # Vercel deployment config
├── .gitignore                  # Ignores .env, node_modules
├── .env.example                # Template for env vars
└── README.md                   # Deployment instructions
```

### Deployment
- **Platform:** Vercel (Free Tier)
- **URL:** `https://calendar-ocr-backend.vercel.app`
- **Auto-deploy:** Pushes to `main` branch trigger deployment (~30 seconds)

### Environment Variables (Vercel)
```
GOOGLE_VISION_API_KEY=<secret-key>
```
**Security:** API key ONLY exists as Vercel environment variable, never committed to git.

### API Endpoint: `/api/ocr.js`

**Request:**
```json
POST https://calendar-ocr-backend.vercel.app/api/ocr
Content-Type: application/json

{
  "image": "<base64-encoded-image>"
}
```

**Response (Success):**
```json
{
  "success": true,
  "text": "Extracted text from image..."
}
```

**Response (No Text):**
```json
{
  "success": true,
  "text": ""
}
```

**Response (Error):**
```json
{
  "error": "Server configuration error",
  "message": "OCR service not properly configured..."
}
```

**Features:**
- CORS enabled (`Access-Control-Allow-Origin: *`)
- POST and OPTIONS methods only
- 30-second timeout, 1024MB memory
- Validates API key presence before calling Vision API
- Comprehensive error handling and logging

---

## 🔄 OCR Pipeline

### Step-by-Step Flow

```
1. User taps shutter button
   └─> CameraScreen captures photo URI

2. Navigate to EventEditorScreen with photo URI
   └─> extractTextFromImage(uri) called

3. preprocessImage(uri)
   ├─> Image.getSize() fetches dimensions
   ├─> Calculate crop region (focus frame %)
   ├─> ImageManipulator.manipulateAsync()
   │   ├─> Crop to focus area (removes 60% of image)
   │   └─> Resize to 1600px width
   └─> Compress to JPEG 70%

4. Read cropped image as base64
   └─> FileSystem.readAsStringAsync()

5. POST to backend API
   └─> fetch(BACKEND_API_URL, { body: { image: base64 } })

6. Backend receives request
   ├─> Validate image data
   ├─> Validate API key environment variable
   └─> Call Google Cloud Vision API

7. Google Vision API processes image
   └─> Returns textAnnotations array

8. Backend extracts text
   └─> Returns { success: true, text: "..." }

9. Frontend receives text
   └─> parseEventDetails(text) called

10. Parse text into structured data
    ├─> findAllDates(text) - regex matching
    ├─> For each date found:
    │   ├─> findTimesNearDate() - find time within 200 chars
    │   ├─> parseTime() - convert to 24-hour format
    │   ├─> findTitleNearDate() - heuristic title extraction
    │   └─> Create event object
    └─> Return array of event objects

11. EventEditorScreen displays parsed event
    └─> User reviews/edits and saves
```

### Current Limitations

**Parsing Logic:**
- ❌ Title extraction: Simple heuristic (first non-date line)
- ❌ Location extraction: Not implemented
- ❌ Description extraction: Not implemented
- ✅ Date extraction: Works well (7+ formats)
- ✅ Time extraction: Works well (12/24-hour)

**These will be addressed with GPT-4o-mini integration (see Next Steps).**

---

## 🔄 Recent Changes

### Completed (2025-10-16)

#### 1. **Security Fix - Exposed API Key Removed**
- **Issue:** Google Cloud Vision API key was hardcoded in README.md and ocr.js
- **Fix:** Removed all hardcoded keys, now only exists as Vercel env var
- **Files Changed:**
  - `CalendarOCR-backend/README.md` (line 10, 59)
  - `CalendarOCR-backend/api/ocr.js` (line 9)
- **Commit:** `add9f2e` - Security: Remove exposed API key from codebase
- **Status:** ✅ Deployed to production

#### 2. **Image Cropping Implementation**
- **Issue:** Focus frame was visual only, full image sent to OCR
- **Fix:** Implemented actual image cropping based on focus frame
- **Implementation:**
  - Added `Image.getSize()` to fetch captured image dimensions
  - Calculate crop coordinates: `originX/Y` + `width/height` from percentages
  - Apply crop BEFORE resize using ImageManipulator
  - Removes 60% of image (surrounding posters)
- **Files Changed:**
  - `CalendarOCR/src/utils/ocrService.js` (lines 1-108)
- **Commit:** `24ea4fb` - Fix cropping and AM/PM time parsing
- **Status:** ✅ Ready for testing (rebuild required)

#### 3. **AM/PM Time Parsing Fix**
- **Issue:** "1:30 PM" was parsed as 1:30 AM (wrong meridiem)
- **Root Cause:** 24-hour regex matched "1:30" before 12-hour regex caught "PM"
- **Fix:** Added negative lookahead to 24-hour pattern: `(?!\s*(?:am|pm))`
- **Result:** 12-hour pattern now takes precedence
- **Files Changed:**
  - `CalendarOCR/src/utils/ocrService.js` (lines 247-286)
- **Commit:** `24ea4fb` - Fix cropping and AM/PM time parsing
- **Status:** ✅ Ready for testing (rebuild required)

#### 4. **Comprehensive Logging Added**
- **Purpose:** Debug cropping issues and time parsing errors
- **Coverage:**
  - Image preprocessing: dimensions, crop calculations, success/failure
  - OCR extraction: raw text output, character/line counts
  - Event parsing: detected dates with times, title extraction
  - Time parsing: regex matches, AM/PM conversions
- **Example Output:**
  ```
  OCR: ===== STARTING IMAGE PREPROCESSING =====
  OCR: ✓ Original image dimensions: 3024×4032
  OCR: ✓ Calculated crop region: 2419×2016 at (302, 806)
  OCR:   - This removes 60.0% of the image
  OCR: ✓ Image preprocessed successfully!

  Time parsing: Found 12-hour match "1:30 PM"
  Time parsing: Converting 1PM to 13 (24-hour)
  Time parsing: Selected closest time: 13:30
  ```
- **Files Changed:**
  - `CalendarOCR/src/utils/ocrService.js` (throughout)
- **Commit:** `24ea4fb` - Fix cropping and AM/PM time parsing
- **Status:** ✅ Deployed

---

## ⚠️ Known Issues

### 1. **Inaccurate Event Detail Extraction** (High Priority)
**Symptoms:**
- ✅ Date parsing: Works well
- ✅ Time parsing: Works well (after recent fix)
- ❌ Title extraction: Only finds first non-date line (heuristic)
- ❌ Location extraction: Not implemented
- ❌ Description extraction: Not implemented

**Root Cause:** Regex-based parsing is too simplistic for unstructured poster text

**Solution:** Integrate GPT-4o-mini for structured data extraction (see Next Steps)

### 2. **Cropping Effectiveness** (Testing Required)
**Status:** Implementation complete, needs real-world testing

**Test Scenarios:**
1. Single poster in focus frame → Should extract cleanly
2. Multiple posters (one in focus) → Should only extract focused poster
3. Focus frame partially over multiple posters → May still see text pollution

**If cropping still sees other posters:**
- Check logs for "⚠️ WARNING: Full image sent to OCR" (fallback triggered)
- Verify crop region calculations match camera view
- May need to adjust FOCUS_FRAME percentages

### 3. **Android Support** (Planned)
**Current Status:** iOS only (user has iPhone)

**Required:**
- Android Keystore setup for EAS Build
- Testing on Android device
- Potential platform-specific adjustments

---

## 🚀 Next Steps

### Phase 1: Testing & Validation (Current Phase)
**Goal:** Verify cropping and time parsing fixes work in production

**Tasks:**
1. ✅ Rebuild app with latest changes
   ```bash
   cd /Users/bowenjiang/Desktop/CalendarOCR
   npx eas build --profile development --platform ios
   ```

2. ⏳ Test image cropping
   - Take photo of poster with adjacent posters
   - Check logs for "✓ Image preprocessed successfully!"
   - Verify extracted text only contains focused poster
   - If fallback triggered, investigate error logs

3. ⏳ Test time parsing
   - Take photo of poster with PM times (e.g., "7:30 PM")
   - Check logs for AM/PM conversion details
   - Verify event time is correct in app (should be 19:30, not 7:30)

4. ⏳ Identify remaining parsing issues
   - Note which fields are incorrect (title, location, description)
   - Save examples of problematic posters for GPT integration testing

**Blockers:** None - ready to test

---

### Phase 2: GPT-4o-mini Integration (Next Priority)
**Goal:** Replace regex-based parsing with LLM for accurate structured data extraction

**Current State:**
- User mentioned "GPT-5-nano" (likely meant GPT-4o-mini or GPT-4o-nano)
- User wants to work on this together after cropping is validated

**Proposed Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React Native)                   │
│                                                              │
│  extractTextFromImage(imageUri)                             │
│      ↓                                                       │
│  [1] Call Vercel /api/ocr → Returns raw text               │
│      ↓                                                       │
│  [2] Call Vercel /api/parse-event → Returns structured data│
│      ↓                                                       │
│  Display in EventEditorScreen                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Vercel)                          │
│                                                              │
│  /api/ocr.js (existing)                                     │
│  - Calls Google Cloud Vision API                           │
│  - Returns raw text                                         │
│                                                              │
│  /api/parse-event.js (NEW)                                  │
│  - Receives: { text: "...", date: "2024-12-25" }          │
│  - Calls OpenAI API (GPT-4o-mini)                          │
│  - Prompt: "Extract event details from this poster text"   │
│  - Returns: { title, date, time, location, description }   │
│                                                              │
│  Environment Variables:                                      │
│  - GOOGLE_VISION_API_KEY (existing)                        │
│  - OPENAI_API_KEY (new)                                    │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Plan:**

#### **Step 2.1: Setup OpenAI API**
1. Get OpenAI API key from https://platform.openai.com/api-keys
2. Add to Vercel environment variables: `OPENAI_API_KEY`
3. Install dependency: `npm install openai` in backend

#### **Step 2.2: Create `/api/parse-event.js` Endpoint**
```javascript
// Backend: /api/parse-event.js
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  const { text } = req.body;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini", // or gpt-4o-nano if available
    messages: [
      {
        role: "system",
        content: `You are an expert at extracting event details from poster text.
Extract the following fields:
- title: Event name/title (string)
- date: Date in ISO format YYYY-MM-DD (string)
- time: Time in 24-hour format HH:MM (string)
- location: Venue/location (string, empty if not found)
- description: Brief description (string, empty if not found)

Return ONLY valid JSON with these exact field names.`
      },
      {
        role: "user",
        content: `Extract event details from this poster text:\n\n${text}`
      }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  });

  const eventDetails = JSON.parse(completion.choices[0].message.content);
  return res.status(200).json({ success: true, event: eventDetails });
}
```

#### **Step 2.3: Update Frontend `ocrService.js`**
```javascript
// Frontend: src/utils/ocrService.js

export const extractAndParseEvent = async (imageUri) => {
  // Step 1: Extract text using Vision API (existing)
  const rawText = await extractTextFromImage(imageUri);

  if (!rawText) {
    return createFallbackEvent();
  }

  try {
    // Step 2: Parse with GPT (NEW)
    console.log('Calling GPT for event parsing...');
    const response = await fetch(
      'https://calendar-ocr-backend.vercel.app/api/parse-event',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText })
      }
    );

    const result = await response.json();

    if (result.success && result.event) {
      console.log('GPT parsed event:', result.event);

      // Convert ISO date + time to Date object
      const eventDate = new Date(`${result.event.date}T${result.event.time}`);

      return [{
        title: result.event.title,
        date: eventDate,
        location: result.event.location,
        description: result.event.description,
        notification: '1hr'
      }];
    }
  } catch (error) {
    console.error('GPT parsing failed, falling back to regex:', error);
    // Fallback to existing regex parsing
    return parseEventDetails(rawText);
  }
};
```

#### **Step 2.4: Update EventEditorScreen**
```javascript
// Change from:
const text = await extractTextFromImage(photoUri);
const events = parseEventDetails(text);

// To:
const events = await extractAndParseEvent(photoUri);
```

**Testing Strategy:**
1. Test with simple posters (single event, clear text)
2. Test with complex posters (multiple dates, ambiguous text)
3. Compare GPT results vs regex results
4. Measure API costs (GPT-4o-mini is ~$0.15 per 1M input tokens)
5. Implement caching if needed to reduce costs

**Cost Estimate:**
- Average poster: ~500 tokens input, ~100 tokens output
- Cost per request: ~$0.0001 (negligible)
- 1,000 requests: ~$0.10
- **Conclusion:** Very affordable for personal use

---

### Phase 3: UI/UX Improvements (Future)
**Goal:** Polish app experience and add features

**Ideas:**
1. **Preview cropped image** before OCR
   - Show user what will be sent to OCR
   - Allow manual crop adjustment

2. **Multiple event detection**
   - If poster has multiple dates, ask user which event to create
   - Support batch event creation

3. **Camera improvements**
   - Auto-focus on poster
   - Flash control
   - Gallery import (scan existing photos)

4. **History/cache**
   - Save scanned events locally
   - Re-scan from history

5. **Settings**
   - Default notification time
   - Calendar selection (work vs personal)
   - OCR language selection

---

### Phase 4: Android Support (Future)
**Goal:** Release on Google Play Store

**Tasks:**
1. Generate Android Keystore
   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore \
     -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Configure EAS for Android
   ```bash
   npx eas build --profile production --platform android
   ```

3. Test on Android device
   - Camera permissions
   - Image cropping (may need platform-specific adjustments)
   - Calendar API differences

4. Submit to Google Play Store

---

## ✅ Testing Checklist

### Pre-Rebuild Checklist
- [x] All code changes committed
- [x] Backend deployed and healthy
- [x] Environment variables set in Vercel
- [x] No hardcoded secrets in code

### Post-Rebuild Testing

#### **Cropping Tests**
- [ ] Test 1: Single poster, centered in focus frame
  - Expected: Only extract text from focused poster
  - Check logs: "✓ Image preprocessed successfully!"

- [ ] Test 2: Multiple adjacent posters
  - Expected: Only extract text from focused poster
  - Check logs: Crop region removes 60% of image

- [ ] Test 3: Focus frame partially overlapping multiple posters
  - Expected: May still see some pollution (edge case)
  - Note: May need to adjust crop percentages

- [ ] Test 4: Cropping failure fallback
  - Expected: Logs show "⚠️ WARNING: Full image sent to OCR"
  - Investigate error details in logs

#### **Time Parsing Tests**
- [ ] Test 1: "1:30 PM" on poster
  - Expected: Event time is 13:30 (1:30 PM)
  - Check logs: "Converting 1PM to 13 (24-hour)"

- [ ] Test 2: "12:00 AM" on poster
  - Expected: Event time is 00:00 (midnight)
  - Check logs: "Converting 12AM to 0 (24-hour)"

- [ ] Test 3: "12:00 PM" on poster
  - Expected: Event time is 12:00 (noon)
  - Check logs: "Keeping 12 (already correct)"

- [ ] Test 4: "19:00" on poster (24-hour format)
  - Expected: Event time is 19:00 (7:00 PM)
  - Check logs: "Found 24-hour match"

#### **Date Parsing Tests**
- [ ] Test various date formats:
  - [ ] 12/25/2024
  - [ ] December 25, 2024
  - [ ] 25 December 2024
  - [ ] Dec 25, 2024
  - [ ] December 25 (current year)

#### **End-to-End Tests**
- [ ] Full workflow: Camera → OCR → Parse → Review → Save
- [ ] Event appears in calendar
- [ ] Notification is set correctly
- [ ] All fields (title, date, location, description) are populated

#### **Performance Tests**
- [ ] OCR request completes in < 5 seconds
- [ ] Image preprocessing completes in < 1 second
- [ ] No app crashes or freezes

---

## 📊 Metrics & Monitoring

### Backend (Vercel Dashboard)
- **URL:** https://vercel.com/dashboard
- **Metrics:**
  - Function invocations per day
  - Errors and failed requests
  - Execution duration (should be < 5s)
  - Bandwidth usage

### Google Cloud Vision API
- **URL:** https://console.cloud.google.com/apis/dashboard
- **Metrics:**
  - API requests per day
  - Quota usage (1,000 free per month)
  - Error rate
- **Set up billing alert:** Notify at 500 requests to avoid surprises

### App Analytics (Future)
- Consider integrating Expo Analytics
- Track: OCR success rate, parsing accuracy, user retention

---

## 🛠️ Development Commands

### Frontend (CalendarOCR)
```bash
# Navigate to project
cd /Users/bowenjiang/Desktop/CalendarOCR

# Install dependencies
npm install

# Start development server (Expo Go)
npx expo start

# Build for iOS (development)
npx eas build --profile development --platform ios

# Build for iOS (production)
npx eas build --profile production --platform ios

# Check build status
npx eas build:list

# View logs
npx expo logs
```

### Backend (CalendarOCR-backend)
```bash
# Navigate to project
cd /Users/bowenjiang/Desktop/CalendarOCR-backend

# Install dependencies
npm install

# Test locally (requires Vercel CLI)
vercel dev

# Deploy to production
git add .
git commit -m "Update backend"
git push
# Vercel auto-deploys in ~30 seconds

# View logs
vercel logs
```

### Git Workflow
```bash
# Check status
git status

# View changes
git diff

# Stage changes
git add <file>

# Commit with message
git commit -m "Description"

# Push to remote
git push

# View commit history
git log --oneline -10
```

---

## 📝 Code Style & Conventions

### Commit Messages
- Format: `<type>: <description>`
- Types: Fix, Feature, Security, Refactor, Docs, Test
- Include "🤖 Generated with Claude Code" footer
- Use Co-Authored-By for Claude contributions

### Logging Conventions
- Use prefixes: `OCR:`, `Time parsing:`, `Event parsing:`
- Use symbols: `✓` (success), `✗` (error), `⚠️` (warning)
- Use section markers: `===== SECTION START =====`
- Log important values and calculations

### Error Handling
- Always have fallback logic for critical paths
- Log errors with context (function name, input values)
- Return graceful defaults (empty event) instead of crashing
- User-friendly error messages in UI

---

## 🔒 Security Notes

### API Keys
- **NEVER commit API keys to git**
- Store as environment variables in Vercel
- Use `.env.example` as template
- Backend validates env vars before use

### CORS
- Backend allows all origins (`*`)
- Consider restricting to app domain in production
- Rate limiting handled by Vercel

### Data Privacy
- No user data stored on backend
- Images processed in-memory only
- No logging of image content
- Comply with Google Cloud Vision API ToS

---

## 📚 Resources

### Documentation
- Expo: https://docs.expo.dev
- React Native: https://reactnative.dev
- Vercel: https://vercel.com/docs
- Google Cloud Vision: https://cloud.google.com/vision/docs
- OpenAI API: https://platform.openai.com/docs

### Support
- Expo Discord: https://chat.expo.dev
- GitHub Issues: Create in respective repos
- Stack Overflow: Tag with `expo`, `react-native`

---

## 📅 Project Timeline

- **2025-10-15:** Project started, initial OCR implementation
- **2025-10-16:** Backend deployed, security fixes, cropping implemented
- **2025-10-16:** Phase 1 testing in progress
- **TBD:** Phase 2 GPT integration
- **TBD:** Phase 3 UI improvements
- **TBD:** Phase 4 Android support

---

## 🎯 Success Criteria

### MVP (Phase 1-2)
- [x] Camera captures poster images
- [x] OCR extracts text from images
- [x] Backend secures API key
- [ ] Cropping eliminates text pollution (testing)
- [ ] Time parsing is accurate (testing)
- [ ] GPT extracts title, location, description accurately
- [ ] User can save events to calendar
- [ ] App is stable and usable

### Production Ready
- [ ] Android support
- [ ] 95%+ OCR success rate
- [ ] < 5 second processing time
- [ ] Error handling covers all edge cases
- [ ] User feedback/help system
- [ ] App Store submission ready

---

**Last Updated:** 2025-10-16
**Next Review:** After Phase 1 testing complete
