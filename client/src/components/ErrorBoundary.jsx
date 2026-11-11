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

    static getDerivedStateFromError() {
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
                    background: 'var(--color-brand-danger-soft)',
                    border: '1px solid #f44336',
                    borderRadius: '8px',
                    margin: '20px',
                    color: 'white'
                }}>
                    <h2 style={{ color: 'var(--color-brand-danger)', marginBottom: '12px' }}>Something went wrong</h2>
                    <details style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error Details</summary>
                        <div style={{
                            background: 'var(--color-bg-card-alt)',
                            padding: '12px',
                            borderRadius: '4px',
                            overflow: 'auto',
                            maxHeight: '300px'
                        }}>
                            <div style={{ color: 'var(--color-brand-danger)', marginBottom: '8px' }}>
                                {this.state.error && this.state.error.toString()}
                            </div>
                            <div style={{ color: 'var(--color-text-muted)' }}>
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </div>
                        </div>
                    </details>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '12px',
                            padding: '8px 16px',
                            background: 'var(--color-bg-card-hover)',
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
