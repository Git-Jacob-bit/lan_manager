import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import MachineDetails from './pages/MachineDetails';
import Telemetry from './pages/Telemetry';
import DockerManager from './pages/DockerManager';
import TerminalPage from './pages/TerminalPage';
import AppManagerPage from './pages/AppManagerPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/machines/:mac" element={<MachineDetails />} />
        <Route path="/machines/:mac/telemetry" element={<Telemetry />} />
        <Route path="/machines/:mac/docker" element={<DockerManager />} />
        <Route path="/machines/:mac/terminal" element={<TerminalPage />} />
        <Route path="/machines/:mac/apps" element={<AppManagerPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;