
import React from 'react';

interface PreviewWindowProps {
    htmlContent: string | null;
}

export const PreviewWindow: React.FC<PreviewWindowProps> = ({ htmlContent }) => {
    if (!htmlContent) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center p-4">
                <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-border-color" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <h3 className="mt-2 text-lg font-medium text-text-primary">Live Preview</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                        Enter a website URL and click "Clone Website" to begin.
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                        The cloned website preview will appear here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-grow flex flex-col bg-white">
            <iframe
                srcDoc={htmlContent}
                title="Live Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
            />
        </div>
    );
};
