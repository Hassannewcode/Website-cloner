
import React, { useState } from 'react';
import { FileSystem } from '../types';
import { FolderIcon } from './icons/FolderIcon';
import { FileIcon } from './icons/FileIcon';

interface FileExplorerProps {
    fileSystem: FileSystem;
    onFileSelect: (file: { path: string; content: string }) => void;
    activeFilePath?: string;
}

const FileSystemTree: React.FC<{
    node: FileSystem;
    onFileSelect: (file: { path: string; content: string }) => void;
    pathPrefix?: string;
    activeFilePath?: string;
}> = ({ node, onFileSelect, pathPrefix = '', activeFilePath }) => {
    const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({'public': true, 'src': true});

    const toggleFolder = (name: string) => {
        setOpenFolders(prev => ({ ...prev, [name]: !prev[name] }));
    };
    
    return (
        <ul className="pl-4">
            {Object.entries(node).sort(([aName, aNode], [bName, bNode]) => {
                if (aNode.type === bNode.type) return aName.localeCompare(bName);
                return aNode.type === 'folder' ? -1 : 1;
            }).map(([name, childNode]) => {
                const currentPath = pathPrefix ? `${pathPrefix}/${name}` : name;
                if (childNode.type === 'folder') {
                    return (
                        <li key={currentPath}>
                            <div onClick={() => toggleFolder(name)} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-gray-700/50 rounded">
                                <FolderIcon isOpen={!!openFolders[name]} />
                                <span className="text-text-primary">{name}</span>
                            </div>
                            {openFolders[name] && <FileSystemTree node={childNode.children} onFileSelect={onFileSelect} pathPrefix={currentPath} activeFilePath={activeFilePath} />}
                        </li>
                    );
                } else {
                    return (
                        <li 
                            key={currentPath} 
                            onClick={() => onFileSelect({ path: currentPath, content: childNode.content })} 
                            className={`flex items-center gap-2 cursor-pointer py-1 hover:bg-gray-700/50 rounded px-1 ${activeFilePath === currentPath ? 'bg-accent/20' : ''}`}
                        >
                            <FileIcon />
                            <span className="text-text-secondary">{name}</span>
                        </li>
                    );
                }
            })}
        </ul>
    );
};


export const FileExplorer: React.FC<FileExplorerProps> = ({ fileSystem, onFileSelect, activeFilePath }) => {
    return (
        <div className="p-3 font-mono text-sm">
            <h2 className="text-base font-sans font-semibold text-text-primary mb-2 px-2">File Explorer</h2>
            <FileSystemTree node={fileSystem} onFileSelect={onFileSelect} activeFilePath={activeFilePath} />
        </div>
    );
};
