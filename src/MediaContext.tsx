import React, { useContext, useState, useEffect } from "react";
import isEqual from "lodash/isEqual";
import identity from "lodash/identity";
import { MediaValuesContext } from "./MediaMachine";
import {
  MediaContextType,
  MediaContextProps,
  MediaContextConsumerProps
} from "./types";

export const MediaContext = React.createContext<MediaContextType | null>(null);

export const _useMediaContext = () => {
  const mediaContext = useContext(MediaContext);

  if (!mediaContext) {
    throw new Error("Please place the component inside MediaProvider");
  }

  return mediaContext;
};

export function useMediaContext<TSelected = MediaValuesContext>(
  selector: (context: MediaValuesContext) => TSelected = identity
) {
  const mediaContext = _useMediaContext();
  const [partialState, setPartialState] = useState(
    selector(mediaContext._mediaService.state.context)
  );

  useEffect(() => {
    const { unsubscribe } = mediaContext._mediaService.subscribe((state) => {
      if (state.changed !== true) return;

      if (selector === identity) {
        setPartialState(selector(state.context));
        return;
      }

      if (
        !isEqual(
          selector(mediaContext._mediaService.state.context),
          partialState
        )
      ) {
        setPartialState(selector(mediaContext._mediaService.state.context));
      }
    });

    return (): void => unsubscribe();
  }, [selector, partialState, mediaContext._mediaService]);

  return {
    ...partialState,
    mediaElement: mediaContext.mediaElement,
    setCurrentBirateIndex: mediaContext.setCurrentBirateIndex,

    // Media util methods for controlling media behaviors across browsers
    setPaused: mediaContext.setPaused,
    setMuted: mediaContext.setMuted,
    setCurrentTime: mediaContext.setCurrentTime,
    setPlaybackRate: mediaContext.setPlaybackRate,
    setVolume: mediaContext.setVolume,
    setRotate: mediaContext.setRotate
  };
}

export const withMediaContext = <P extends { mediaContext: MediaContextProps }>(
  Component: React.ComponentType<P>
) => (props: Omit<P, "mediaContext">) => {
  const mediaContext = useMediaContext();
  return <Component {...(props as P)} mediaContext={mediaContext} />;
};

export const MediaConsumer: React.FC<MediaContextConsumerProps> = ({
  render
}) => {
  const mediaContext = useMediaContext();

  return <>{render(mediaContext)}</>;
};
