import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Join from './pages/Join';
import PlayerGame from './pages/PlayerGame';
import HostDashboard from './pages/HostDashboard';
import SpectatorView from './pages/SpectatorView';
import ModelUpload from './pages/ModelUpload';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join/:gameId" element={<Join />} />
      <Route path="/play/:playerId" element={<PlayerGame />} />
      <Route path="/host/:gameId" element={<HostDashboard />} />
      <Route path="/spectator/:gameId" element={<SpectatorView />} />
      <Route path="/upload-model" element={<ModelUpload />} />
    </Routes>
  );
}

export default App;
