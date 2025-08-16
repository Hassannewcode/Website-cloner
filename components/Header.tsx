
import React, { useState, useEffect, useRef } from 'react';

interface HeaderProps {
    onInitiateCloning: (url: string, useScreenshot: boolean) => void;
    isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onInitiateCloning, isLoading }) => {
    const [url, setUrl] = useState<string>('https://example.com');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onInitiateCloning(url, false); // Default action: HTML-only
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="flex-shrink-0 bg-secondary border-b border-border-color p-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <h1 className="text-xl font-semibold text-text-primary">Agentic Web Cloner</h1>
            </div>
            <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-grow max-w-2xl">
                <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-primary border border-border-color rounded-md px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                    required
                    disabled={isLoading}
                />
                
                <div className="relative inline-flex rounded-md shadow-sm">
                    <button
                        type="submit"
                        className="bg-accent text-white font-semibold px-4 py-1.5 rounded-l-md hover:bg-blue-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        disabled={isLoading}
                        title="Start cloning using HTML-only analysis"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Cloning...
                            </>
                        ) : 'Clone Website'}
                    </button>
                    
                    <div ref={dropdownRef} className="relative block">
                        <button
                            type="button"
                            className="bg-accent text-white font-semibold px-2 py-1.5 rounded-r-md hover:bg-blue-500 disabled:bg-gray-500 disabled:cursor-not-allowed border-l border-blue-400 h-full"
                            disabled={isLoading}
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        >
                            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                            </svg>
                        </button>
                        {isDropdownOpen && (
                             <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-secondary ring-1 ring-border-color focus:outline-none z-10">
                                <div className="py-1">
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onInitiateCloning(url, true);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="block px-4 py-2 text-sm text-text-primary hover:bg-primary"
                                    >
                                        Clone with Screenshot
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </form>
        </header>
    );
};
