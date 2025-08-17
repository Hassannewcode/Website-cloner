
export enum CloningState {
    IDLE = 'IDLE',
    CLONING = 'CLONING',
    AWAITING_USER_INPUT = 'AWAITING_USER_INPUT',
    FIXING = 'FIXING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR',
}

export interface File {
    type: 'file';
    content: string;
}

export interface Folder {
    type: 'folder';
    children: FileSystem;
}

export type FileSystemNode = File | Folder;

export interface FileSystem {
    [key: string]: FileSystemNode;
}

export enum LogType {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
    SYSTEM = 'SYSTEM',
    DEBUG = 'DEBUG',
    THOUGHT = 'THOUGHT',
}

export interface AgentLogEntry {
    message: string;
    type: LogType;
    timestamp: Date;
}
