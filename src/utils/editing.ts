import type {Segment} from "../components/media/JumpCut";

/** Add padding to segments and filter out tiny ones */
export const buildCutList = (
  speechSegments: Segment[],
  options: {paddingSeconds?: number; minSegmentSeconds?: number} = {},
): Segment[] => {
  const {paddingSeconds = 0.1, minSegmentSeconds = 0.3} = options;

  return speechSegments
    .map((seg) => ({
      startSeconds: Math.max(0, seg.startSeconds - paddingSeconds),
      endSeconds: seg.endSeconds + paddingSeconds,
    }))
    .filter((seg) => seg.endSeconds - seg.startSeconds >= minSegmentSeconds);
};

/** Merge adjacent segments separated by small gaps */
export const mergeSegments = (
  segments: Segment[],
  gapThresholdSeconds: number = 0.3,
): Segment[] => {
  if (segments.length === 0) return [];

  const sorted = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);
  const merged: Segment[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.startSeconds - last.endSeconds <= gapThresholdSeconds) {
      last.endSeconds = Math.max(last.endSeconds, current.endSeconds);
    } else {
      merged.push({...current});
    }
  }

  return merged;
};

/** Calculate total duration of segments in seconds */
export const calculateTotalDuration = (segments: Segment[]): number =>
  segments.reduce((sum, seg) => sum + (seg.endSeconds - seg.startSeconds), 0);

/** Offset captions for clip extraction */
export const offsetCaptions = <T extends {startMs: number; endMs: number}>(
  captions: T[],
  offsetMs: number,
): T[] =>
  captions
    .map((c) => ({
      ...c,
      startMs: c.startMs - offsetMs,
      endMs: c.endMs - offsetMs,
    }))
    .filter((c) => c.startMs >= 0 && c.endMs > 0);

/**
 * Re-map caption timestamps from the ORIGINAL video timeline onto the compressed
 * (silence-removed) timeline that JumpCut produces for a given cut list.
 *
 * `segments` are the KEPT (speech) segments in seconds — the SAME list passed to
 * JumpCut. Without this, captions generated against the original video appear at
 * the wrong time once the silences between segments are dropped (the desync the
 * user cares about). A single offset is not enough: removal is multi-segment, so
 * each timestamp must subtract the cumulative removed time that precedes it.
 *
 * A timestamp that falls inside a removed gap snaps to the start of the next kept
 * segment; captions that collapse to zero length (fully inside a gap) are dropped.
 */
export const remapCaptionsThroughCutList = <
  T extends {startMs: number; endMs: number; timestampMs?: number | null},
>(
  captions: T[],
  segments: Segment[],
): T[] => {
  if (segments.length === 0) return captions;
  const sorted = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);

  const mapTime = (tMs: number): number => {
    let cumulativeMs = 0;
    for (const seg of sorted) {
      const segStartMs = seg.startSeconds * 1000;
      const segEndMs = seg.endSeconds * 1000;
      if (tMs < segStartMs) return cumulativeMs; // inside a removed gap → snap to seg start
      if (tMs <= segEndMs) return cumulativeMs + (tMs - segStartMs);
      cumulativeMs += segEndMs - segStartMs;
    }
    return cumulativeMs; // after the last kept segment
  };

  return captions
    .map((c) => ({
      ...c,
      startMs: mapTime(c.startMs),
      endMs: mapTime(c.endMs),
      ...(c.timestampMs != null ? {timestampMs: mapTime(c.timestampMs)} : {}),
    }))
    .filter((c) => c.endMs > c.startMs);
};
