import React from "react";
import { clamp } from "lodash";

export const callAll = (...fns) => (...arg) => {
  fns.forEach((fn) => fn && fn(...arg));
};

/**
 * @param time in seconds
 *
 * @returns result in the object format { hours: number, minutes: number, seconds: number }
 */
export const parseTime = (time = 0) => {
  if (time === Infinity) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  const normalizedTime = Math.round(time);
  const hours = Math.floor(normalizedTime / 3600);
  const minutes = Math.floor((normalizedTime / 60) % 60);
  const seconds = normalizedTime % 60;
  return {
    hours,
    minutes,
    seconds
  };
};

export enum TimeFormat {
  HHMMSS = "HHMMSS",
  MMSS = "MMSS"
}

/**
 *
 * @param time in seconds
 *
 * @returns formatted time in HH:MM:SS
 */
export const formatTime = (time = 0, timeFormat: TimeFormat) => {
  const { hours, minutes, seconds } = parseTime(time);

  const formatedHours = hours.toString().padStart(2, "0");
  const formatedMinutes = minutes.toString().padStart(2, "0");
  const formatedSeconds = seconds.toString().padStart(2, "0");

  if (timeFormat === TimeFormat.HHMMSS) {
    return `${formatedHours}:${formatedMinutes}:${formatedSeconds}`;
  }

  if (timeFormat === TimeFormat.MMSS) {
    return `${formatedMinutes}:${formatedSeconds}`;
  }

  throw new Error("Invalid timeFormat");
};

interface CalculateRelatedCoordinatesArg {
  event: React.PointerEvent<HTMLElement> | PointerEvent;
  element: HTMLElement;
}

export const calculateRelatedCoordinates = ({
  event,
  element
}: CalculateRelatedCoordinatesArg) => {
  const { left, width, top, height } = element.getBoundingClientRect();
  const { clientX, clientY } = event;

  let currentX: number;
  let currentY: number;

  if (clientX < left) {
    currentX = 0;
  } else if (clientX > left + width) {
    currentX = width;
  } else {
    currentX = clientX - left;
  }

  if (clientY < top) {
    currentY = 0;
  } else if (clientY > top + height) {
    currentY = height;
  } else {
    currentY = clientY - top;
  }

  return { x: currentX, y: currentY };
};

export const convertTimeRangesToSeconds = (
  buffered: TimeRanges
): number[][] => {
  return Array.from({ length: buffered.length }, (_, index) => [
    Math.floor(buffered.start(index)),
    buffered.end(index)
  ]);
};

export const checkIE = () => {
  const ua = window.navigator.userAgent;
  if (ua.indexOf("Trident/7.0") > 0) return true;
  else if (ua.indexOf("Trident/6.0") > 0) return true;
  else if (ua.indexOf("Trident/5.0") > 0) return true;
  else return false;
};

const isIE = checkIE();

export const KEY_BOARD = {
  up: isIE ? "Up" : "ArrowUp",
  down: isIE ? "Down" : "ArrowDown",
  right: isIE ? "Right" : "ArrowRight",
  left: isIE ? "Left" : "ArrowLeft"
};

type ReactRef<T> = React.Ref<T> | React.MutableRefObject<T>;

/**
 * Assigns a value to a ref function or object
 *
 * @param ref the ref to assign to
 * @param value the value
 */
export function assignRef<T>(ref: ReactRef<T> | undefined, value: T) {
  if (ref == null) return;

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  try {
    // @ts-ignore - We can safely assign value to ref here as it's mutable
    ref.current = value;
  } catch (error) {
    throw new Error(`Cannot assign value '${value}' to ref '${ref}'`);
  }
}

/**
 * Combine multiple React refs into a single ref function.
 *
 * @param refs refs to assign to value to
 */
export function useMergeRefs<T>(...refs: (ReactRef<T> | undefined)[]) {
  return React.useMemo(() => {
    if (refs.every((ref) => ref == null)) {
      return null;
    }
    return (node: T) => {
      refs.forEach((ref) => {
        if (ref) assignRef(ref, node);
      });
    };
  }, refs);
}

/**
 * Convert the given number to a percentage string
 * Ex. 0.5 => "50%"
 *
 * @param value A number in the range [0, 1]
 */
export const getPercentageString = (value: number) =>
  `${clamp(value * 100, 0, 100)}%`;
