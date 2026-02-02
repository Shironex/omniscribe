import { useEffect, useState } from 'react';

function App() {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(!!window.electronAPI);
  }, []);

  return (
    <div className="h-screen w-screen bg-omniscribe-bg text-omniscribe-text-primary flex flex-col">
      {/* Title bar for Electron */}
      {isElectron && (
        <div className="h-8 bg-omniscribe-surface border-b border-omniscribe-border flex items-center justify-between px-4 select-none drag">
          <span className="text-sm font-medium text-omniscribe-text-secondary">Omniscribe</span>
          <div className="flex items-center gap-2 no-drag">
            <button
              onClick={() => window.electronAPI?.window.minimize()}
              className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"
              aria-label="Minimize"
            />
            <button
              onClick={() => window.electronAPI?.window.maximize()}
              className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
              aria-label="Maximize"
            />
            <button
              onClick={() => window.electronAPI?.window.close()}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
              aria-label="Close"
            />
          </div>
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-omniscribe-accent-primary to-omniscribe-accent-secondary bg-clip-text text-transparent">
            Omniscribe
          </h1>
          <p className="text-omniscribe-text-secondary">
            AI-powered development environment
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-omniscribe-text-muted">
            <span className="px-2 py-1 rounded bg-omniscribe-surface">
              {isElectron ? 'Desktop' : 'Web'}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
