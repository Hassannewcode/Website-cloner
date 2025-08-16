
import React, { useState } from 'react';

interface AuthPromptProps {
    targetUrl: string;
    onResume: (nextUrl: string) => void;
    onCancel: () => void;
}

export const AuthPrompt: React.FC<AuthPromptProps> = ({ targetUrl, onResume, onCancel }) => {
    const [nextUrl, setNextUrl] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onResume(nextUrl);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-secondary rounded-lg border border-border-color shadow-xl w-full max-w-4xl flex flex-col text-center transform transition-all duration-300 scale-100 overflow-hidden">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-text-primary mb-3">Authentication Required</h2>
                    <p className="text-text-secondary mb-4">
                        The AI agent has paused because it encountered a login page. Please sign in or create an account in the window below to continue.
                    </p>
                </div>
                
                <div className="flex-grow border-y border-border-color bg-white min-h-[50vh]">
                     <iframe
                        src={targetUrl}
                        title="Authentication"
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-forms allow-same-origin"
                    />
                </div>

                <form onSubmit={handleSubmit} className="p-6 bg-primary/50">
                     <p className="text-text-secondary mb-4">
                        After you've logged in, please copy the new URL from your browser's address bar into the field below and click "Resume Cloning".
                    </p>
                    <div className="flex justify-center gap-4">
                        <input
                            type="url"
                            value={nextUrl}
                            onChange={(e) => setNextUrl(e.target.value)}
                            placeholder="https://example.com/dashboard"
                            className="w-full max-w-md bg-primary border border-border-color rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                            required
                        />
                        <button
                            type="submit"
                            disabled={!nextUrl}
                            className="bg-accent text-white font-semibold px-6 py-2 rounded-md hover:bg-blue-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                        >
                            Resume Cloning
                        </button>
                         <button
                            type="button"
                            onClick={onCancel}
                            className="bg-gray-600 hover:bg-gray-700 text-text-primary font-semibold px-6 py-2 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
