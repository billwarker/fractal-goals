import React from 'react';
import { isDynamicImportError, pageReloader } from '../../utils/lazyWithRetry';

class ComponentErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ComponentErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const isChunkLoadError = isDynamicImportError(this.state.error);
            // Default generic fallback if none provided
            const Fallback = this.props.fallback;
            if (Fallback) {
                return <Fallback error={this.state.error} resetErrorBoundary={() => this.setState({ hasError: false })} />;
            }

            return (
                <div style={{
                    padding: '16px',
                    margin: '8px 0',
                    backgroundColor: 'var(--color-brand-danger-soft)',
                    border: '1px solid #ff5252',
                    borderRadius: '8px',
                    color: 'var(--color-text-primary)'
                }}>
                    <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-brand-danger)' }}>Something went wrong in this component</h4>
                    <pre style={{
                        margin: 0,
                        fontSize: '12px',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap'
                    }}>
                        {this.state.error?.toString()}
                    </pre>
                    <button
                        onClick={() => {
                            if (isChunkLoadError) {
                                pageReloader.reload();
                                return;
                            }
                            this.setState({ hasError: false });
                        }}
                        style={{
                            marginTop: '12px',
                            background: 'transparent',
                            border: '1px solid #ff5252',
                            color: 'var(--color-brand-danger)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        {isChunkLoadError ? 'Reload Page' : 'Try Again'}
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ComponentErrorBoundary;
