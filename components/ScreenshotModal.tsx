
import React, { useState, useEffect, useCallback } from 'react';

interface ScreenshotModalProps {
    targetUrl: string;
    onScreenshotReady: (file: File) => void;
    onCancel: () => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({ targetUrl, onScreenshotReady, onCancel }) => {
    const [pastedImage, setPastedImage] = useState<File | null>(null);
    const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null);

    const handlePaste = useCallback((event: ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image')) {
                const blob = item.getAsFile();
                if (blob) {
                    const imageFile = new File([blob], 'screenshot.png', { type: blob.type });
                    setPastedImage(imageFile);
                    
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setPastedImagePreview(reader.result as string);
                    };
                    reader.readAsDataURL(blob);
                    break; // Stop after finding the first image
                }
            }
        }
    }, []);

    useEffect(() => {
        window.addEventListener('paste', handlePaste);
        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [handlePaste]);

    const handleSubmit = () => {
        if (pastedImage) {
            onScreenshotReady(pastedImage);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-secondary rounded-lg border border-border-color shadow-xl w-full max-w-2xl flex flex-col p-6 text-center transform transition-all duration-300 scale-100">
                <h2 className="text-2xl font-bold text-text-primary mb-3">Take a Screenshot</h2>
                <p className="text-text-secondary mb-4">
                    We've opened <strong className="text-accent">{targetUrl}</strong> in a new tab.
                </p>
                
                <div className="bg-primary border-2 border-dashed border-border-color rounded-lg p-8 mb-4">
                    {pastedImagePreview ? (
                        <img src={pastedImagePreview} alt="Screenshot Preview" className="max-h-64 mx-auto rounded-md shadow-lg" />
                    ) : (
                        <>
                            <p className="text-lg font-semibold text-text-primary">Paste Screenshot Here</p>
                            <p className="text-text-secondary mt-2">
                                Use your system's tool (e.g., <kbd className="font-sans px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Win+Shift+S</kbd> or <kbd className="font-sans px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Cmd+Shift+4</kbd>), then paste (<kbd className="font-sans px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Ctrl+V</kbd>).
                            </p>
                        </>
                    )}
                </div>

                <div className="flex justify-center gap-4 mt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="bg-primary hover:bg-border-color text-text-primary font-semibold px-6 py-2 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!pastedImage}
                        className="bg-accent text-white font-semibold px-6 py-2 rounded-md hover:bg-blue-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                    >
                        Clone with this Screenshot
                    </button>
                </div>
            </div>
        </div>
    );
};
