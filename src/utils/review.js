import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from './logger';

// Completed-save "sessions" at which we ATTEMPT a native review prompt: the 1st
// save (fresh enthusiasm), then the 5th and 15th (proven, sticky users). Apple
// itself caps prompts (~3/yr) and hides the outcome, so we keep our own cadence
// conservative and spread out rather than burning asks early.
const MILESTONES = [1, 5, 15];
const MIN_DAYS_BETWEEN = 45; // never prompt twice within this cool-down window
const DAY_MS = 86400000;

const SESSIONS_KEY = '@calendarocr_save_sessions';
const PROMPTS_KEY = '@calendarocr_review_prompts';
const LAST_AT_KEY = '@calendarocr_review_last_at';

const readInt = async (key) => parseInt(await AsyncStorage.getItem(key), 10) || 0;

// Call once per completed save flow (after the celebration). Increments the
// session counter and, when the next milestone is reached AND we're outside the
// cool-down AND we haven't used all our asks, triggers Apple's native review
// prompt. Gated so it can never nag.
// Note: the prompt NEVER appears in dev or TestFlight builds — only in the live
// App Store build. Its absence while testing is expected, not a bug.
export const recordSaveAndMaybeReview = async () => {
  try {
    const sessions = (await readInt(SESSIONS_KEY)) + 1;
    await AsyncStorage.setItem(SESSIONS_KEY, String(sessions));

    const prompts = await readInt(PROMPTS_KEY);
    if (prompts >= MILESTONES.length) return;       // used all our asks
    if (sessions < MILESTONES[prompts]) return;     // next milestone not reached yet

    const lastAt = await readInt(LAST_AT_KEY);
    if (lastAt && Date.now() - lastAt < MIN_DAYS_BETWEEN * DAY_MS) return; // cooling down

    // Record the attempt BEFORE prompting so a throw can't loop or double-fire.
    await AsyncStorage.setItem(PROMPTS_KEY, String(prompts + 1));
    await AsyncStorage.setItem(LAST_AT_KEY, String(Date.now()));

    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      log(`Requested App Store review (session ${sessions})`);
    }
  } catch (e) {
    // Non-fatal — a rating prompt must never affect the save flow.
    log('recordSaveAndMaybeReview skipped: ' + (e && e.message ? e.message : e));
  }
};
