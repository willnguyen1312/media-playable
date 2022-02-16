import { createMachine, assign } from "@xstate/fsm";

import { BitrateInfo } from "./types";
import { DEFAULT_AUTO_BITRATE_INDEX, MediaStatus } from "./constants";

export interface MediaValuesContext {
  currentTime: number;
  seeking: boolean;
  duration: number;
  volume: number;
  playbackRate: number;
  paused: boolean;
  muted: boolean;
  ended: boolean;
  status: MediaStatus;
  rotate: number;
  error: string;
  buffered: TimeRanges | null;

  // Streaming properties
  autoBitrateEnabled: boolean;
  bitrateInfos: BitrateInfo[];
  currentBirateIndex: number;
}

export type MediaEvent = {
  type: "UPDATE";
  updateValues: Partial<MediaValuesContext>;
};

export type MediaState = {
  value: "ready";
  context: MediaValuesContext;
};

export const mediaMachine = createMachine<
  MediaValuesContext,
  MediaEvent,
  MediaState
>(
  {
    id: "media",
    initial: "ready",
    context: {
      currentTime: 0,
      duration: 0,
      ended: false,
      error: "",
      muted: false,
      paused: true,
      playbackRate: 1,
      rotate: 0,
      seeking: false,
      status: MediaStatus.LOADING,
      volume: 1,
      buffered: null,
      autoBitrateEnabled: true,
      bitrateInfos: [],
      currentBirateIndex: DEFAULT_AUTO_BITRATE_INDEX
    },
    states: {
      ready: {
        on: {
          UPDATE: {
            actions: ["updateMedia"]
          }
        }
      }
    }
  },
  {
    actions: {
      updateMedia: assign((context, event) => ({
        ...context,
        ...event.updateValues
      }))
    }
  }
);
