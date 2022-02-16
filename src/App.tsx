import { MediaProvider } from "./MediaProvider";
import { Playable } from "./Playable";
import "./styles.css";
import { useMediaContext } from "./MediaContext";

const ConnectedMediaComp = () => {
  const { currentTime, setPaused } = useMediaContext((mediaContext) => ({
    currentTime: mediaContext.currentTime
  }));

  return (
    <>
      <button onClick={() => setPaused(false)}>Play</button>
      <h3>CurrentTime: {currentTime}</h3>
    </>
  );
};

export default function App() {
  return (
    <div className="App">
      <h1>Sample Playable Player</h1>
      <MediaProvider initialDuration={100}>
        <Playable />
        <ConnectedMediaComp />
      </MediaProvider>
    </div>
  );
}
