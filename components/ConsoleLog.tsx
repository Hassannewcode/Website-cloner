
import React, { useEffect, useRef } from 'react';
import { ErrorIcon } from './icons/ErrorIcon';

interface ConsoleLogProps {
    errors: string[];
}

export const ConsoleLog: React.FC<ConsoleLogProps> = ({ errors }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [errors]);

    if (errors.length === 0) {
        return (
            <div className="flex-grow flex items-center justify-center p-4 text-center h-full">
                <div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="mt-2 text-md font-medium text-text-primary">No Console Errors</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                        The preview is running without any errors.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div ref={logContainerRef} className="h-full overflow-y-auto p-3 font-mono text-xs">
            {errors.map((error, index) => (
                <div key={index} className="flex items-start gap-3 p-2 border-b border-border-color/50">
                    <ErrorIcon />
                    <pre className="flex-1 whitespace-pre-wrap break-words text-red-400">
                        {error}
                    </pre>
                </div>
            ))}
        </div>
    );
};
