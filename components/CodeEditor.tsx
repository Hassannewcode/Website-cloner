
import React from 'react';

interface CodeEditorProps {
    file: {
        path: string;
        content: string;
    };
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ file }) => {
    const lineCount = file.content.split('\n').length;

    return (
        <div className="flex-grow flex flex-col font-mono text-sm overflow-hidden">
            <div className="flex-shrink-0 bg-primary px-4 py-2 border-b border-border-color">
                <p className="text-text-secondary">{file.path}</p>
            </div>
            <div className="flex-grow overflow-auto p-4 bg-secondary flex">
                <div className="text-right text-text-secondary/50 pr-4 select-none pt-px" aria-hidden="true">
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i}>{i + 1}</div>
                    ))}
                </div>
                <pre className="flex-1 !m-0">
                    <code>{file.content}</code>
                </pre>
            </div>
        </div>
    );
};
