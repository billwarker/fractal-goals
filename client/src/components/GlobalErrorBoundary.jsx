import React from 'react';

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("GlobalErrorBoundary caught an error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div style={{
                    padding: '2rem',
                    backgroundColor: '#1e1e1e',
                    color: '#e0e0e0',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'system-ui, sans-serif'
                }}>
                    <h1 style={{ color: '#ff5252' }}>Something went wrong.</h1>
                    <p>The application encountered an unexpected error.</p>
                    <div style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        backgroundColor: '#333',
                        borderRadius: '4px',
                        maxWidth: '600px',
                        width: '100%',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        textAlign: 'left'
                    }}>
                        {this.state.error?.toString()}
                    </div>
                    <button
                        onClick={() => window.location.href = '/'}
                        style={{
                            marginTop: '2rem',
                            padding: '0.75rem 1.5rem',
                            backgroundColor: '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '1rem'
                        }}
                    >
                        Return to Home
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
