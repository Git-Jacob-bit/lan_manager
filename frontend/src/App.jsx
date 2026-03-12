import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import MachineDetails from './pages/MachineDetails';
import Telemetry from './pages/Telemetry';
import DockerManager from './pages/DockerManager';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/machines/:mac" element={<MachineDetails />} />
        <Route path="/machines/:mac/telemetry" element={<Telemetry />} />
        <Route path="/machines/:mac/docker" element={<DockerManager />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;