import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Join from './pages/Join';
import PlayerGame from './pages/PlayerGame';
import MainStage from './pages/MainStage';
import HostDashboard from './pages/HostDashboard';
import SpectatorView from './pages/SpectatorView';
import ModelUpload from './pages/ModelUpload';

function App() {
  return (
    <Routes>
      {/* Main entry - start the experience */}
      <Route path="/" element={<Home />} />
      
      {/* Main projected screen with full storyline */}
      <Route path="/stage/:gameId" element={<MainStage />} />
      
      {/* Player joins and plays from their phone */}
      <Route path="/join/:gameId" element={<Join />} />
      <Route path="/play/:playerId" element={<PlayerGame />} />
      
      {/* Legacy routes kept for compatibility */}
      <Route path="/host/:gameId" element={<HostDashboard />} />
      <Route path="/spectator/:gameId" element={<SpectatorView />} />
      <Route path="/upload-model" element={<ModelUpload />} />
    </Routes>
  );
}

export default App;
