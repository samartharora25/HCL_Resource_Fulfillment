import React, { useState, useRef } from 'react';
import { Layout } from './components/Layout';
import { UploadModule } from './components/UploadModule';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import type { ParseResult } from './lib/parsing';
import { Button } from './components/ui';

function App() {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'parsing' | 'column_mapping' | 'sheet_selection' | 'validation' | 'error'>('idle');
  const uploadRef = useRef<{ reset: () => void }>(null);

  const handleReset = () => {
    setParseResult(null);
    setUploadStatus('idle');
  };

  const handleBack = () => {
    if (parseResult) {
      handleReset();
    } else {
      uploadRef.current?.reset();
    }
  };

  const showBack = parseResult !== null || uploadStatus !== 'idle';

  return (
    <Layout showBack={showBack} onBack={handleBack}>
      {!parseResult ? (
        <UploadModule 
          ref={uploadRef}
          onDataReady={setParseResult} 
          onStatusChange={setUploadStatus} 
        />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
            <Button variant="outline" onClick={handleReset}>Upload New File</Button>
          </div>
          <AnalyticsDashboard parseResult={parseResult} />
        </div>
      )}
    </Layout>
  );
}

export default App;
