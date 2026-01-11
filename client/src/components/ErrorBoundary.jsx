import React from 'react';

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    background: '#2a1a1a',
                    border: '1px solid #f44336',
                    borderRadius: '8px',
                    margin: '20px',
                    color: 'white'
                }}>
                    <h2 style={{ color: '#f44336', marginBottom: '12px' }}>Something went wrong</h2>
                    <details style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: '#ccc' }}>
                        <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error Details</summary>
                        <div style={{
                            background: '#1a1a1a',
                            padding: '12px',
                            borderRadius: '4px',
                            overflow: 'auto',
                            maxHeight: '300px'
                        }}>
                            <div style={{ color: '#ff6b6b', marginBottom: '8px' }}>
                                {this.state.error && this.state.error.toString()}
                            </div>
                            <div style={{ color: '#888' }}>
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </div>
                        </div>
                    </details>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '12px',
                            padding: '8px 16px',
                            background: '#444',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
