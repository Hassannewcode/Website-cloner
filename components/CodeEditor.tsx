
import React from 'react';

interface CodeEditorProps {
    file: {
        path: string;
        content: string;
    };
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ file }) => {
    return (
        <div className="flex-grow flex flex-col font-mono text-sm overflow-hidden">
            <div className="flex-shrink-0 bg-primary px-4 py-2 border-b border-border-color">
                <p className="text-text-secondary">{file.path}</p>
            </div>
            <div className="flex-grow overflow-auto p-4 bg-secondary">
                <pre>
                    <code>{file.content}</code>
                </pre>
            </div>
        </div>
    );
};
