import * as React from 'react';
import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // You can log the error to an error reporting service here
        // Example: logErrorToService(error, errorInfo);
        // For now, just output to console
        console.error('ErrorBoundary caught an error', error, errorInfo);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const errorMessage = (this.state.error && this.state.error.message || '').toLowerCase();
            const isAiFetchFailure =
                errorMessage.indexOf('failed to fetch') >= 0 ||
                errorMessage.indexOf('networkerror') >= 0 ||
                errorMessage.indexOf('load failed') >= 0;

            return (
                <div>
                    <h2>Something went wrong.</h2>
                    <details style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.error && this.state.error.toString()}
                    </details>

                    <p>Couple of things to check:</p>
                    <ul>
                        <li>Check the web part properties for AI API endpoint and key.</li>
                        <li>Make sure that your API is up and running by going into Azure AI service chat completion and testing it manually.</li>
                        <li>Document guide field in the web part properties needs information regarding the document type and library link.</li>
                        <li>After publishing your page, refresh the page to ensure the latest web part settings are loaded.</li>
                    </ul>
                    {isAiFetchFailure && (
                        <>
                            <p>Additional checks for AI service fetch failure:</p>
                            <ul>
                                <li>Confirm the AI API endpoint starts with <code>https://</code> and is the full chat completions URL.</li>
                                <li>Confirm the AI API key is valid, active, and copied without extra spaces.</li>
                                <li>Verify endpoint and key belong to the same Azure OpenAI resource.</li>
                            </ul>
                        </>
                    )}
                    <p>
                        If the issue still persists after publishing and refreshing the page, please contact support at{' '}
                        <a href="mailto:apps@devwals.com">apps@devwals.com</a>.
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;