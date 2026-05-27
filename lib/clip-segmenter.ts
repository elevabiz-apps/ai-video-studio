/**
 * Segments a flat list of word-level captions into logical video clips
 * by detecting pauses (gaps > GAP_THRESHOLD_MS) between tokens.
 */

export type RawCaption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs?: number;
  confidence?: number;
};

export type ClipSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

const MIN_CLIP_DURATION_MS = 15_000; // clips shorter than 15s are discarded (TikTok/Reels minimum)
const MAX_CLIP_DURATION_MS = 90_000; // clips longer than 90s are force-split
const GAP_THRESHOLD_MS = 1_500;      // silence > 1.5s between words = clip boundary

export function segmentCaptions(captions: RawCaption[]): ClipSegment[] {
  if (captions.length === 0) return [];

  const segments: ClipSegment[] = [];
  let currentGroup: RawCaption[] = [captions[0]];

  for (let i = 1; i < captions.length; i++) {
    const prev = captions[i - 1];
    const curr = captions[i];
    const gap = curr.startMs - prev.endMs;
    const groupDuration = curr.endMs - currentGroup[0].startMs;

    const shouldSplit = gap > GAP_THRESHOLD_MS || groupDuration > MAX_CLIP_DURATION_MS;

    if (shouldSplit) {
      const clipDuration = prev.endMs - currentGroup[0].startMs;
      if (clipDuration >= MIN_CLIP_DURATION_MS) {
        segments.push(buildSegment(currentGroup, prev.endMs));
      }
      currentGroup = [curr];
    } else {
      currentGroup.push(curr);
    }
  }

  // Push final group
  if (currentGroup.length > 0) {
    const last = currentGroup[currentGroup.length - 1];
    const clipDuration = last.endMs - currentGroup[0].startMs;
    if (clipDuration >= MIN_CLIP_DURATION_MS) {
      segments.push(buildSegment(currentGroup, last.endMs));
    }
  }

  return segments;
}

function buildSegment(tokens: RawCaption[], endMs: number): ClipSegment {
  return {
    startMs: tokens[0].startMs,
    endMs,
    text: tokens.map((t) => t.text).join("").trim(),
  };
}
