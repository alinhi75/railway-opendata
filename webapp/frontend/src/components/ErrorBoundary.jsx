import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('UI crashed in ErrorBoundary:', error, errorInfo);
  }

  render() {
    const { hasError } = this.state;
    const { title = 'Something went wrong.', children } = this.props;

    if (hasError) {
      return (
        <div style={{ padding: 16, margin: '16px auto', maxWidth: 1200 }}>
          <div style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
          }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>⚠️ {title}</div>
            <div style={{ color: '#6b7280', fontSize: 14 }}>
              Check the browser console for the exact error.
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
