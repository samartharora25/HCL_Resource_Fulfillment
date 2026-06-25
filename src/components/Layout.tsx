import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

export function Layout({ children, showBack = false, onBack }: LayoutProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        backgroundColor: 'var(--hcl-ink)', 
        color: 'var(--hcl-white)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {showBack && (
            <button 
              onClick={onBack}
              title="Go Back"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--hcl-white)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '50%',
                transition: 'background-color 0.2s',
                marginRight: '-4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <img src="/logo.png" alt="HCL Logo" style={{ height: '32px', width: 'auto' }} />
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--hcl-white)' }}>
            Resource Fulfillment Analytics
          </h1>
        </div>
      </header>
      
      <main style={{ flex: 1, padding: '32px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {children}
      </main>
    </div>
  );
}
