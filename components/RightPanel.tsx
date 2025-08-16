
import React, { useState, useEffect } from 'react';
import { AgentLog } from './AgentLog';
import { ConsoleLog } from './ConsoleLog';
import { AgentLogEntry } from '../types';

interface RightPanelProps {
    logs: AgentLogEntry[];
    consoleErrors: string[];
    isFixing: boolean;
}

type Tab = 'log' | 'console';

export const RightPanel: React.FC<RightPanelProps> = ({ logs, consoleErrors, isFixing }) => {
    const [activeTab, setActiveTab] = useState<Tab>('log');

    // Automatically switch to console tab when errors appear
    useEffect(() => {
        if (consoleErrors.length > 0) {
            setActiveTab('console');
        }
    }, [consoleErrors.length]);


    return (
        <div className="flex-grow flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-secondary px-2 pt-2 border-b border-border-color flex items-end gap-1">
                <button
                    onClick={() => setActiveTab('log')}
                    className={`px-4 py-2 text-sm font-sans font-semibold rounded-t-md transition-colors ${activeTab === 'log' ? 'bg-primary text-text-primary' : 'text-text-secondary hover:bg-primary/50'}`}
                >
                    Agent Log
                </button>
                <button
                    onClick={() => setActiveTab('console')}
                    className={`px-4 py-2 text-sm font-sans font-semibold rounded-t-md flex items-center gap-2 transition-colors ${activeTab === 'console' ? 'bg-primary text-text-primary' : 'text-text-secondary hover:bg-primary/50'}`}
                >
                    Console
                    {consoleErrors.length > 0 && !isFixing && (
                        <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">{consoleErrors.length}</span>
                    )}
                     {isFixing && (
                        <svg className="animate-spin h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    )}
                </button>
            </div>
             <div className="flex-grow overflow-hidden bg-primary">
                {activeTab === 'log' ? <AgentLog logs={logs} /> : <ConsoleLog errors={consoleErrors} />}
            </div>
        </div>
    );
};
