
import React, { useEffect, useRef } from 'react';
import { AgentLogEntry, LogType } from '../types';

interface AgentLogProps {
    logs: AgentLogEntry[];
}

const getLogTypeColor = (type: LogType): string => {
    switch (type) {
        case LogType.SUCCESS:
            return 'text-green-400';
        case LogType.WARN:
            return 'text-yellow-400';
        case LogType.ERROR:
            return 'text-red-400';
        case LogType.SYSTEM:
            return 'text-accent';
        case LogType.INFO:
        default:
            return 'text-text-secondary';
    }
};

const getLogTypePrefix = (type: LogType): string => {
    switch (type) {
        case LogType.SUCCESS: return '[SUCCESS]';
        case LogType.WARN:    return '[WARN]   ';
        case LogType.ERROR:   return '[ERROR]  ';
        case LogType.SYSTEM:  return '[SYSTEM] ';
        case LogType.INFO:    return '[INFO]   ';
        default:              return '[LOG]    ';
    }
};


export const AgentLog: React.FC<AgentLogProps> = ({ logs }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="flex-grow flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-secondary px-4 py-2 border-b border-border-color">
                <h2 className="text-base font-sans font-semibold text-text-primary">Agent Log</h2>
            </div>
            <div ref={logContainerRef} className="flex-grow overflow-y-auto p-3 font-mono text-xs">
                {logs.map((log, index) => (
                    <div key={index} className="flex gap-3">
                        <span className="text-text-secondary/50 select-none">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span className={`${getLogTypeColor(log.type)}`}>
                          {getLogTypePrefix(log.type)}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-words">
                          {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
