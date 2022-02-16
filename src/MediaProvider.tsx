import React, { FC, useRef, useEffect } from "react";
import { interpret } from "@xstate/fsm";
import Hls from "hls.js";

import { mediaMachine, MediaValuesContext } from "./MediaMachine";
import { BitrateInfo } from "./types";
import { MediaStatus, DEFAULT_AUTO_BITRATE_INDEX } from "./constants";
import clamp from "lodash/clamp";
import { MediaContext } from "./MediaContext";

interface MediaProviderProps {
  mediaSource?: string;
  initialDuration?: number;
}

export const MediaProvider: FC<MediaProviderProps> = React.memo(
  ({ children, mediaSource, initialDuration = 0 }) => {
    // Refs
    const _playPromise = useRef<Promise<void>>();
    const _pausedRef = useRef<boolean>(true);
    const _hlsRef = useRef<Hls>();
    const _mediaRef = useRef<HTMLMediaElement>(null);
    const _timeoutLoadingId = useRef<any>();

    const _mediaServiceRef = useRef(interpret(mediaMachine).start());

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const updateMediaService = (updateValues: Partial<MediaValuesContext>) => {
      _mediaServiceRef.current.send({
        type: "UPDATE",
        updateValues
      });
    };

    const _getMedia = (): HTMLMediaElement => {
      if (_mediaRef.current) {
        return _mediaRef.current;
      }

      throw new Error("Media element is not available");
    };

    const _getHls = () => {
      const hls = _hlsRef.current;
      if (!hls) {
        throw new Error("HLS instance is not available");
      }
      return hls;
    };

    const releaseHlsResource = () => {
      const hls = _hlsRef.current;
      if (hls) {
        hls.destroy();
      }
    };

    useEffect(() => {
      if (!mediaSource) {
        return;
      }

      const media = _getMedia();
      releaseHlsResource();

      if (Hls.isSupported()) {
        const newHls = new Hls();
        _hlsRef.current = newHls;
        newHls.attachMedia(media as HTMLVideoElement);
        newHls.on(Hls.Events.MEDIA_ATTACHED, () => {
          newHls.loadSource(mediaSource);
        });

        newHls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          const bitrateInfos: BitrateInfo[] = ((data.levels as unknown) as Hls.Level[]).map(
            (level) => {
              return {
                bitrate: level.bitrate,
                // Some video and audio streams don't come with width and height
                height: level.height || 0,
                width: level.width || 0
              };
            }
          );

          updateMediaService({ bitrateInfos });
        });

        newHls.on(Hls.Events.LEVEL_SWITCHED, (_, { level }) => {
          updateMediaService({ currentBirateIndex: level });
        });

        // https://github.com/video-dev/hls.js/blob/master/docs/API.md#fifth-step-error-handling
        // Hls.js code for error handling
        newHls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                // try to recover network error
                newHls.startLoad();
                updateMediaService({ status: MediaStatus.RECOVERING });
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                // try to recover media error
                newHls.recoverMediaError();
                updateMediaService({ status: MediaStatus.RECOVERING });
                break;
              default:
                // cannot recover
                newHls.destroy();
                updateMediaService({ status: MediaStatus.ERROR });
                break;
            }
          }
        });
      } else if (media && media.canPlayType("application/vnd.apple.mpegurl")) {
        // For native support like Apple's mobile safari
        media.src = mediaSource;
      }

      return releaseHlsResource;
    }, [mediaSource, updateMediaService]);

    const checkMediaHasDataToPlay = () => {
      const media = _getMedia();
      const { currentTime } = media;

      // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/buffered
      // Convert buffered object to time ranges in number values
      // Example: buffered -> [[0, 13], [15, 30]]
      const timeRanges = Array.from(
        { length: media.buffered.length },
        (_, index) => {
          // We need to round down on start side of the very first segment for cross-browsers compatibility
          // I.e. In rare cases, Firefox and Safari start current time is different than 0 (i.e: 0.5614)
          // This is a hack as our streaming service has not worked on normalizing stream data
          // This leads to falsy check as buffered values are very odd values like 0.00123
          const start = media.buffered.start(index);
          const end = media.buffered.end(index);
          return [Math.floor(start) === 0 ? Math.floor(start) : start, end];
        }
      );

      // Detect whether timeRanges has data to play at current time of media element
      const result = timeRanges.some((timeRange) => {
        const [start, end] = timeRange;

        return currentTime >= start && currentTime <= end;
      });

      return result;
    };

    const setLoadingStatus = () => {
      const timeoutId = _timeoutLoadingId.current;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Avoid showing loading indicator early on fast stream which can be annoying to user
      // Similar to Youtube's experience
      _timeoutLoadingId.current = setTimeout(
        () => updateMediaService({ status: MediaStatus.LOADING }),
        1000
      );
    };

    const setCanPlayStatus = () => {
      const timeoutId = _timeoutLoadingId.current;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      updateMediaService({ status: MediaStatus.CAN_PLAY });
    };

    const _onLoadedMetadata = () => {
      if (!_pausedRef.current) {
        _getMedia().play();
      }
    };

    const _onSeeking = () => {
      const media = _getMedia();
      updateMediaService({
        seeking: true,
        currentTime: media.currentTime,
        ended: media.ended
      });
      if (!checkMediaHasDataToPlay()) {
        setLoadingStatus();
      }
    };

    const _onSeeked = () => updateMediaService({ seeking: false });

    const _onRateChange = () =>
      updateMediaService({ playbackRate: _getMedia().playbackRate });

    const _onVolumeChange = () => {
      const media = _getMedia();
      updateMediaService({ muted: media.muted, volume: media.volume });
    };

    const _onPause = () => {
      _pausedRef.current = true;
      updateMediaService({ paused: true, ended: _getMedia().ended });
    };

    const _onPlay = () => {
      _pausedRef.current = false;
      updateMediaService({ paused: false, ended: _getMedia().ended });
    };

    const _onCanPlay = () => setCanPlayStatus();

    const _onProgress = () => {
      if (checkMediaHasDataToPlay()) {
        setCanPlayStatus();
      }
      updateMediaService({ buffered: _getMedia().buffered });
    };

    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/waiting_event
    // The name is misleading as the event still gets fired when data is available for playing
    const _onWaiting = () => {
      if (checkMediaHasDataToPlay()) {
        setCanPlayStatus();
      } else {
        setLoadingStatus();
      }
    };

    const _onTimeUpdate = () =>
      updateMediaService({ currentTime: _getMedia().currentTime });

    const _onDurationChange = () => {
      const duration = Math.round(_getMedia().duration);

      if (duration !== Infinity) {
        updateMediaService({ duration });
      }
    };

    const _onError = () => updateMediaService({ status: MediaStatus.ERROR });

    const setCurrentTime = (currentTime: number) => {
      const media = _getMedia();
      const newCurrentTime = clamp(currentTime, 0, media.duration);
      media.currentTime = newCurrentTime;
    };

    const setPlaybackRate = (playbackRate: number) =>
      (_getMedia().playbackRate = playbackRate);

    const setVolume = (volume: number) => {
      // Browsers only allow 0 to 1 volume value
      // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume
      const newVolume = clamp(volume, 0, 1);
      _getMedia().volume = newVolume;
    };

    const setMuted = (muted: boolean) => (_getMedia().muted = muted);

    // We need this special handler to handle play/pause methods across browsers
    // https://developers.google.com/web/updates/2017/06/play-request-was-interrupted
    const setPaused = async (paused: boolean) => {
      const media = _getMedia();
      // We need to store the latest paused state in ref for later access
      _pausedRef.current = paused;
      // Update UI
      updateMediaService({ paused });

      if (paused) {
        const playPromise = _playPromise.current;
        if (playPromise) {
          await playPromise;

          _playPromise.current = undefined;
          // Check the latest paused state
          if (_pausedRef.current) {
            media.pause();
          }
        } else {
          // IE doesn't return promise, we can just hit pause method
          media.pause();
        }
      } else {
        // Modern browser return a promise, undefined in IE
        _playPromise.current = media.play();
      }
    };

    const setCurrentBirateIndex = (bitrateIndex: number) => {
      updateMediaService({
        autoBitrateEnabled: bitrateIndex === DEFAULT_AUTO_BITRATE_INDEX,
        currentBirateIndex: bitrateIndex
      });
      const hlsInstance = _getHls();
      if (hlsInstance.currentLevel !== bitrateIndex) {
        hlsInstance.currentLevel = bitrateIndex;
      }
    };

    const setRotate = (rotate: number) =>
      updateMediaService({ rotate: rotate % 360 });

    const _applyInitialDuration = () =>
      updateMediaService({
        duration: initialDuration
      });

    return (
      <MediaContext.Provider
        value={{
          _initialDuration: initialDuration,
          _applyInitialDuration,
          // Media element
          mediaElement: _mediaRef.current,

          setCurrentBirateIndex,

          // Media methods
          setCurrentTime,
          setPlaybackRate,
          setVolume,
          setMuted,
          setPaused,
          setRotate,

          // Media's id - We use id here
          // as we want our consumer code to be able to attach ref on native media element
          _mediaRef,
          _mediaService: _mediaServiceRef.current,

          // Internal event hanlders - we use these to hook into media's events
          _onLoadedMetadata,
          _onSeeking,
          _onSeeked,
          _onRateChange,
          _onVolumeChange,
          _onCanPlay,
          _onWaiting,
          _onPause,
          _onPlay,
          _onTimeUpdate,
          _onProgress,
          _onDurationChange,
          _onError
        }}
      >
        {children}
      </MediaContext.Provider>
    );
  }
);
