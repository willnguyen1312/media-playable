import React, { useEffect, useRef } from "react";

import { _useMediaContext } from "./MediaContext";

interface HijackedMediaElement extends HTMLMediaElement {
  paused: boolean;
  duration: number;
}

const hijackMediaElement = (
  mediaElement: HijackedMediaElement,
  { frequency, duration }: { frequency: number; duration: number }
): {
  cleanup: () => void;
} => {
  //  We store hijacked values here to differentiate from controlled properties of native media element
  //  Such as playbackRate, volume, etc
  const mediaProperties = {
    paused: true,
    currentTime: 0,
    playbackRate: 1,
    duration
  };

  let timerId: number;

  // configurable value is required to override readonly value of media element
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty

  Object.defineProperty(mediaElement, "paused", {
    configurable: true,
    get() {
      return mediaProperties.paused;
    },
    set(newValue: boolean) {
      mediaProperties.paused = newValue;
      const eventName = newValue ? "pause" : "play";

      mediaElement.dispatchEvent(new window.CustomEvent(eventName));
    }
  });

  Object.defineProperty(mediaElement, "duration", {
    configurable: true,
    get() {
      return mediaProperties.duration;
    },
    set(newValue: number) {
      mediaProperties.duration = newValue;
      mediaElement.dispatchEvent(new window.CustomEvent("durationchange"));

      if (mediaProperties.duration) {
        mediaElement.currentTime = 0;
      }
    }
  });

  Object.defineProperty(mediaElement, "currentTime", {
    configurable: true,
    get() {
      return mediaProperties.currentTime;
    },
    set(newValue: number) {
      const normalizedValue = Math.min(newValue, mediaProperties.duration);
      mediaProperties.currentTime = normalizedValue;
      mediaElement.dispatchEvent(new window.CustomEvent("timeupdate"));

      // Prevent current time out of bound and dispatch ended event
      if (normalizedValue === mediaProperties.duration) {
        mediaElement.dispatchEvent(new window.CustomEvent("ended"));
        mediaElement.pause();
      }
    }
  });

  // This is meant for custom playback without involving actual media elements
  // since browsers limit the playbackRate to certain levels
  // https://stackoverflow.com/questions/30970920/html5-video-what-is-the-maximum-playback-rate
  Object.defineProperty(mediaElement, "playbackRate", {
    configurable: true,
    get() {
      return mediaProperties.playbackRate;
    },
    set(newValue: number) {
      mediaProperties.playbackRate = newValue;
      mediaElement.dispatchEvent(new window.CustomEvent("ratechange"));
    }
  });

  const clearTimer = () => {
    if (timerId) {
      clearInterval(timerId);
    }
  };

  Object.assign(mediaElement, {
    play: () => {
      clearTimer();

      // Reset current time to mimic browser behavior
      if (duration === mediaElement.currentTime) {
        mediaElement.currentTime = 0;
      }

      timerId = window.setInterval(() => {
        const incrementedTime = (1 * mediaElement.playbackRate) / frequency;
        mediaElement.currentTime += incrementedTime;
      }, 1000 / frequency);

      mediaProperties.paused = false;
      mediaElement.paused = false;
    },
    pause: () => {
      clearTimer();
      mediaProperties.paused = true;
      mediaElement.paused = true;
    }
  });

  return {
    cleanup: clearTimer
  };
};

export interface PlayableProps {
  frequency?: number;
  src?: string;
}

export const Playable: React.FC<PlayableProps> = ({
  children,
  // Frequency default value to mimic browser's media behavior
  // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event
  frequency = 4,
  src = ""
}) => {
  const {
    _mediaRef,
    _onDurationChange,
    _onLoadedMetadata,
    _onPause,
    _onPlay,
    _onRateChange,
    _onTimeUpdate,
    _initialDuration,
    _applyInitialDuration
  } = _useMediaContext();
  const hijackedMediaObj = useRef<ReturnType<typeof hijackMediaElement>>();

  // Hijact media element
  useEffect(() => {
    const mediaElement = _mediaRef.current;
    if (mediaElement && !hijackedMediaObj.current && _initialDuration) {
      hijackedMediaObj.current = hijackMediaElement(mediaElement, {
        frequency,
        duration: _initialDuration
      });
    }

    return () => {
      if (hijackedMediaObj.current) {
        hijackedMediaObj.current.cleanup();
      }
    };
    // This is intentional - we only need to run once on start-up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mediaElement = _mediaRef.current;
    // We need to update hijacked media element's internal state at this point on component update lifecycle
    // As duration property comes directly from MediaProvider to work across Video and Audio component
    if (mediaElement) {
      mediaElement.dispatchEvent(new window.CustomEvent("emptied"));
      (mediaElement as HijackedMediaElement).duration = _initialDuration;
      _applyInitialDuration();
      mediaElement.dispatchEvent(new window.CustomEvent("loadedmetadata"));
    }
    // Dispatch loadedmetadata event to inform MediaProvider that it's ready to play
    // This is intentional as we only use initialDuration once for initial value on src change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    // We could have used div here instead of audio for semantic meaning
    // Since we want to reuse all valuable properties like volume, playbackRate, etc
    // We should use audio instead and pick up the ones we need and hide it from screen reader
    // This is also beneficial in that the events that this component fires will have a media element as the target
    <audio
      style={{
        visibility: "hidden"
      }}
      ref={_mediaRef}
      onDurationChange={_onDurationChange}
      onLoadedMetadata={_onLoadedMetadata}
      onPause={_onPause}
      onPlay={_onPlay}
      onRateChange={_onRateChange}
      onTimeUpdate={_onTimeUpdate}
    >
      {children}
    </audio>
  );
};
