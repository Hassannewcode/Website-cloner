
import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Header } from './components/Header';
import { FileExplorer } from './components/FileExplorer';
import { PreviewWindow } from './components/PreviewWindow';
import { CodeEditor } from './components/CodeEditor';
import { RightPanel } from './components/RightPanel';
import { ScreenshotModal } from './components/ScreenshotModal';
import { AuthPrompt } from './components/AuthPrompt';
import { CloningState, FileSystem, AgentLogEntry, LogType, FileSystemNode } from './types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
};

const consoleCaptureScript = `
<script>
  const originalError = console.error;
  console.error = function(...args) {
    const message = args.map(arg => {
        try {
            if (arg instanceof Error) return arg.stack;
            if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
            return String(arg);
        } catch (e) {
            return 'Unserializable object';
        }
    }).join(' ');
    window.parent.postMessage({ type: 'console-error', message }, '*');
    originalError.apply(console, args);
  };
  window.addEventListener('error', function(event) {
    window.parent.postMessage({ type: 'console-error', message: event.message + ' at ' + event.filename + ':' + event.lineno }, '*');
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason instanceof Error ? event.reason.stack : String(event.reason);
    window.parent.postMessage({ type: 'console-error', message: 'Unhandled promise rejection: ' + reason }, '*');
  });
</script>
`;

const getFileSystemAsText = (fs: FileSystem): string[] => {
    const files: string[] = [];
    const traverse = (node: FileSystem, path: string) => {
        for (const [name, childNode] of Object.entries(node)) {
            const currentPath = path ? `${path}/${name}` : name;
            if (childNode.type === 'file') {
                files.push(`--- File: ${currentPath} ---\n\`\`\`\n${childNode.content}\n\`\`\``);
            } else {
                traverse(childNode.children, currentPath);
            }
        }
    };
    traverse(fs, '');
    return files;
};

const addFileToSystem = (fs: FileSystem, path: string, content: string) => {
    const parts = path.split('/').filter(p => p);
    let current: FileSystem = fs;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || current[part].type !== 'folder') {
            current[part] = { type: 'folder', children: {} };
        }
        current = (current[part] as { type: 'folder', children: FileSystem }).children;
    }
    current[parts[parts.length - 1]] = { type: 'file', content };
};


const App: React.FC = () => {
    const [cloningState, setCloningState] = useState<CloningState>(CloningState.IDLE);
    const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
    const [fileSystem, setFileSystem] = useState<FileSystem>({});
    const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
    const [mainHtmlContent, setMainHtmlContent] = useState<string | null>(null);
    const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
    const [urlToClone, setUrlToClone] = useState('');
    const [authUrl, setAuthUrl] = useState('');
    const [cloningQueue, setCloningQueue] = useState<{ url: string; screenshot?: File }[]>([]);
    const [visitedUrls, setVisitedUrls] = useState<Set<string>>(new Set());
    const [consoleErrors, setConsoleErrors] = useState<string[]>([]);
    const [fixAttempts, setFixAttempts] = useState(0);

    const MAX_FIX_ATTEMPTS = 3;

    const addLog = useCallback((message: string, type: LogType = LogType.INFO) => {
        setAgentLogs(prev => [...prev, { message, type, timestamp: new Date() }]);
    }, []);

    const handleInitiateCloning = (rawUrl: string, useScreenshot: boolean) => {
        if (!rawUrl || ![CloningState.IDLE, CloningState.COMPLETED, CloningState.ERROR].includes(cloningState)) return;

        let url = rawUrl.trim();
        if (!/^(https?:\/\/)/i.test(url)) {
            url = `https://${url}`;
        }

        setCloningState(CloningState.CLONING);
        setAgentLogs([]);
        setFileSystem({});
        setActiveFile(null);
        setMainHtmlContent(null);
        setVisitedUrls(new Set());
        setConsoleErrors([]);
        setFixAttempts(0);
        addLog("Initializing Full-Stack Agentic Cloner v6.0 (Streaming)...", LogType.SYSTEM);
        
        setUrlToClone(url);
        if (useScreenshot) {
             try {
                 window.open(url, '_blank', 'noopener,noreferrer');
                 setIsScreenshotModalOpen(true);
            } catch (e) {
                addLog(`Could not open new tab for URL: ${url}. Please check browser pop-up settings.`, LogType.ERROR);
                setCloningState(CloningState.ERROR);
            }
        } else {
            setCloningQueue([{ url }]);
        }
    };

    const handleScreenshotReady = (file: File) => {
        setIsScreenshotModalOpen(false);
        setCloningQueue([{ url: urlToClone, screenshot: file }]);
    };

    const handleResumeCloning = (nextUrl: string) => {
        if (!nextUrl) {
            addLog("Resuming cancelled. No URL provided.", LogType.WARN);
            setCloningState(CloningState.ERROR);
            return;
        }
        addLog(`User provided new URL. Resuming cloning process at: ${nextUrl}`, LogType.SYSTEM);
        setCloningQueue(prev => [...prev, { url: nextUrl }]);
        setAuthUrl('');
        setCloningState(CloningState.CLONING);
    }
    
    const handleQualityCheck = useCallback(async () => {
        addLog("AI is reviewing code for quality improvements...", LogType.DEBUG);

        const prompt = `You are a Senior Frontend Engineer performing a code review. You will be given the complete source code for a web application that was just cloned by an AI.

**Your Goal:**
Improve the quality, maintainability, and visual fidelity of the code. Look for common issues like:
*   **Asset Paths:** Ensure all asset paths (CSS, JS, images, fonts) are correct. Local files should use relative paths, and remote assets should use absolute URLs.
*   **Responsiveness:** Add or correct the viewport meta tag. Ensure CSS uses responsive units and media queries where appropriate.
*   **Modern Standards:** Replace outdated practices (like using tables for layout) with modern CSS like Flexbox or Grid.
*   **HTML Semantics:** Use semantic HTML5 tags (\`<nav>\`, \`<main>\`, \`<section>\`, etc.) where appropriate.
*   **Code Readability:** Format the code cleanly.

**Task:**
1.  Thoroughly review all the provided files.
2.  If you find improvements, provide the FULL, complete, improved content for any file you decide to change. Do not provide diffs or partial code.
3.  Provide a brief summary of the improvements you made.
4.  If no improvements are needed, simply return an empty \`filesToUpdate\` array.

**Input:**
*   **Source Code:**
    ${getFileSystemAsText(fileSystem).join('\n\n')}

**Output:**
Respond with a single JSON object. Do not add any explanatory text outside the JSON structure.`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            analysis: { type: "STRING", description: "A brief explanation of your improvements." },
                            filesToUpdate: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        path: { type: "STRING", description: "The full path of the file to update." },
                                        content: { type: "STRING", description: "The full, corrected content of the file." }
                                    },
                                    required: ["path", "content"],
                                },
                            },
                        },
                        required: ["analysis", "filesToUpdate"],
                    },
                },
            });

            const result = JSON.parse(response.text);

            if (!result.filesToUpdate || result.filesToUpdate.length === 0) {
                addLog("AI Quality Review: No improvements suggested.", LogType.SYSTEM);
            } else {
                addLog(`AI Quality Review: ${result.analysis}`, LogType.SYSTEM);

                let updatedFileSystem = { ...fileSystem };
                let htmlUpdated = false;

                for (const file of result.filesToUpdate) {
                    addLog(`AI is applying quality improvement to: ${file.path}`, LogType.DEBUG);
                    addFileToSystem(updatedFileSystem, file.path, file.content);
                    if (file.path.endsWith('.html')) {
                        setMainHtmlContent(consoleCaptureScript + file.content);
                        htmlUpdated = true;
                    }
                }

                setFileSystem(updatedFileSystem);
                if (!htmlUpdated) {
                    setMainHtmlContent(prev => prev ? prev + ' ' : null);
                    setTimeout(() => setMainHtmlContent(prev => prev?.trim() ?? null), 0);
                }
                addLog("AI applied quality improvements.", LogType.SUCCESS);
            }
            
            addLog("Cloning process complete. Now monitoring for errors.", LogType.SYSTEM);
            setCloningState(CloningState.COMPLETED);

        } catch (error) {
            console.error("Quality Check Error:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during quality check.";
            addLog(`Failed to perform quality check: ${errorMessage}`, LogType.ERROR);
            setCloningState(CloningState.ERROR);
        }
    }, [fileSystem, addLog]);

    const handleAutoFix = useCallback(async (errors: string[]) => {
        setCloningState(CloningState.FIXING);
        setFixAttempts(prev => prev + 1);
        setConsoleErrors([]); // Clear errors for the next run
    
        addLog(`Analyzing ${errors.length} console error(s)...`, LogType.DEBUG);
    
        const prompt = `
    You are an expert AI developer debugging a web application. You will be given the full source code of the application and a list of console errors from the browser's preview.
    
    **Task:**
    1.  Analyze the provided console errors to understand the immediate problem.
    2.  Analyze the full application source code to find the root cause of the errors.
    3.  Fix the bug(s) by modifying the necessary files.
    4.  **Improve Quality:** While fixing the bug, also improve the quality of the surrounding code. This includes improving readability, using modern best practices, and enhancing code structure.
    5.  Provide the FULL, complete content for any file you change. Do not provide diffs or partial code.
    6.  Provide a brief analysis of the problem and your solution, including the quality improvements you made.
    
    **Input:**
    *   **Console Errors:**
        \`\`\`
        ${errors.join('\n')}
        \`\`\`
    *   **Source Code:**
        ${getFileSystemAsText(fileSystem).join('\n\n')}
    
    **Output:**
    Respond with a single JSON object. Do not add any explanatory text outside the JSON structure.`;
    
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            analysis: { type: "STRING", description: "A brief explanation of the error, your fix, and any quality improvements." },
                            filesToUpdate: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        path: { type: "STRING", description: "The full path of the file to update." },
                                        content: { type: "STRING", description: "The full, corrected content of the file." }
                                    },
                                    required: ["path", "content"],
                                },
                            },
                        },
                        required: ["analysis", "filesToUpdate"],
                    },
                },
            });
    
            const result = JSON.parse(response.text);
            addLog(`AI Analysis: ${result.analysis}`, LogType.SYSTEM);
    
            if (!result.filesToUpdate || result.filesToUpdate.length === 0) {
                addLog("AI analyzed the error but did not provide a file to fix. Stopping auto-fix.", LogType.WARN);
                setCloningState(CloningState.ERROR);
                return;
            }
    
            let updatedFileSystem = { ...fileSystem };
            let htmlUpdated = false;
    
            for (const file of result.filesToUpdate) {
                addLog(`AI is applying fix to: ${file.path}`, LogType.DEBUG);
                addFileToSystem(updatedFileSystem, file.path, file.content);
                if (file.path.endsWith('.html')) { 
                    setMainHtmlContent(consoleCaptureScript + file.content);
                    htmlUpdated = true;
                }
            }
            
            setFileSystem(updatedFileSystem);
            if (!htmlUpdated) {
                setMainHtmlContent(prev => prev ? prev + ' ' : null);
                setTimeout(() => setMainHtmlContent(prev => prev?.trim() ?? null), 0);
            }
    
            addLog("AI proposed a fix. Applied changes and reloading preview.", LogType.SUCCESS);
            setCloningState(CloningState.COMPLETED);
    
        } catch (error) {
            console.error("Auto-fix Error:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during auto-fix.";
            addLog(`Failed to apply fix: ${errorMessage}`, LogType.ERROR);
            setCloningState(CloningState.ERROR);
        }
    }, [fileSystem, addLog]);
    

    useEffect(() => {
        const processQueue = async () => {
            if (cloningState !== CloningState.CLONING || cloningQueue.length === 0) return;
        
            const job = cloningQueue[0];
            if (visitedUrls.has(job.url)) {
                setCloningQueue(prev => prev.slice(1));
                return;
            }
        
            setVisitedUrls(prev => new Set(prev).add(job.url));
            addLog(`Cloning page (${visitedUrls.size + 1}/5): ${job.url}`, LogType.SYSTEM);
        
            try {
                addLog(`Fetching source code...`, LogType.INFO);
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(job.url)}`;
                const fetchResponse = await fetch(proxyUrl);
                if (!fetchResponse.ok) throw new Error(`Failed to fetch URL ${job.url}. Status: ${fetchResponse.status}.`);
                const htmlContent = await fetchResponse.text();
                addLog("Successfully fetched page source.", LogType.SUCCESS);
        
                const assetUrls = Array.from(htmlContent.matchAll(/<link[^>]+href="([^"]+\.css)"|<script[^>]+src="([^"]+\.js)"/g))
                    .map(match => match[1] || match[2]).filter(Boolean).map(assetPath => new URL(assetPath, job.url).href);
        
                const assets: { path: string; content: string }[] = [];
                if (assetUrls.length > 0) {
                    addLog(`Found ${assetUrls.length} assets (CSS/JS). Fetching...`, LogType.INFO);
                    await Promise.all(assetUrls.map(async assetUrl => {
                        try {
                            const assetProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(assetUrl)}`;
                            const assetResponse = await fetch(assetProxy);
                            if (assetResponse.ok) assets.push({ path: assetUrl, content: await assetResponse.text() });
                        } catch (e) {}
                    }));
                }
        
                const prompt = `You are a world-class AI developer agent. Your mission is to clone a web application with high fidelity, producing clean, modern, and maintainable code.

**CRITICAL INSTRUCTION:** You will stream your response as a sequence of JSON objects, one per line. Each object represents a single action. Do not output any text, markdown, or comments outside of these JSON objects.

**GUIDING PRINCIPLES FOR HIGH-QUALITY WORK:**
*   **Visual Fidelity:** Replicate the original design as closely as possible. Pay attention to layout, spacing, typography, and colors.
*   **Modern Code:** Use semantic HTML5, modern CSS (Flexbox, Grid), and ES6+ JavaScript.
*   **Responsiveness:** Ensure the layout is responsive and works on different screen sizes. Start with a proper viewport meta tag in the HTML.
*   **Asset Handling:** Use absolute URLs for external assets (images, fonts). For CSS/JS files you create, use correct relative paths in the HTML.

**PROCEDURE & ACTIONS:**
1.  **Analyze & Plan:** Start by outputting a series of \`thought\` actions to outline your plan. Detail how you'll structure the project (e.g., using a \`public\` directory), what components you see, and how you'll handle assets.
    *   **Action:** \`{ "action": "thought", "content": "Your thinking process goes here." }\`

2.  **Authentication Wall Detection:** If you determine the page is an authentication wall (login/signup):
    *   **Action:** \`{ "action": "authWall", "message": "I've encountered a login page. Please sign in and provide the URL you land on." }\`
    *   After this action, you must stop all other actions for this page.

3.  **File Generation:** If it's NOT an auth wall, generate the necessary files. Output one \`file\` action for each file you create. Provide the full path and complete content. Place frontend assets in a \`public\` directory (e.g., \`public/index.html\`, \`public/css/style.css\`). Ensure HTML files use correct relative paths for links (e.g., \`/css/style.css\`). For external assets like images, use their original absolute URLs in \`src\` attributes. Create a \`server.js\` (Node/Express), \`package.json\`, and \`README.md\` at the root for a mock backend if you infer API calls.
    *   **Action:** \`{ "action": "file", "path": "path/to/file.ext", "content": "Full file content here." }\`

4.  **Identify Next Step:** After generating all files for the current page, analyze the page for the most logical next internal link to continue cloning (e.g., "Dashboard", "View Profile"). Exclude links like "Sign Out", "Terms of Service", etc.
    *   **Action:** \`{ "action": "nextPage", "url": "The full, absolute URL of the next page to clone." }\`

5.  **Completion:** Once you are finished with the current page, send a completion message.
    *   **Action:** \`{ "action": "complete", "message": "Finished processing ${job.url}." }\``;

                let imagePart;
                if (job.screenshot) {
                    const imageBase64 = await fileToBase64(job.screenshot);
                    imagePart = { inlineData: { mimeType: job.screenshot.type, data: imageBase64 } };
                }
                const assetsContentString = assets.map(a => `\n--- Asset: ${a.path} ---\n\`\`\`\n${a.content}\n\`\`\``).join('');
                const existingFiles = getFileSystemAsText(fileSystem).map(f => f.split('---')[1].replace(' File: ', '').trim());
                const textPart = { text: `Prompt: ${prompt}\n\nExisting Files: [${existingFiles.join(', ')}]\n\nHTML Content for ${job.url}:\n\`\`\`html\n${htmlContent}\n\`\`\`` + assetsContentString };
                const contents = imagePart ? { parts: [textPart, imagePart] } : textPart.text;

                addLog("Dispatching AI agent. Streaming response...", LogType.SYSTEM);
                const responseStream = await ai.models.generateContentStream({ model: 'gemini-2.5-flash', contents });
                
                let buffer = '';
                let stopProcessing = false;

                for await (const chunk of responseStream) {
                    if (stopProcessing) break;
                    buffer += chunk.text;
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                        const line = buffer.substring(0, newlineIndex).trim();
                        buffer = buffer.substring(newlineIndex + 1);

                        if (line) {
                            try {
                                const action = JSON.parse(line);
                                if (handleStreamedAction(action, job.url)) {
                                    stopProcessing = true;
                                    break;
                                }
                            } catch (e) {
                                addLog(`AI Output (non-JSON): ${line}`, LogType.DEBUG);
                            }
                        }
                    }
                }
                if (buffer.trim() && !stopProcessing) {
                     try {
                        const action = JSON.parse(buffer.trim());
                        handleStreamedAction(action, job.url);
                    } catch (e) {
                        addLog(`AI Output (non-JSON): ${buffer.trim()}`, LogType.DEBUG);
                    }
                }

                if (!stopProcessing) {
                     setCloningQueue(prev => prev.slice(1));
                }
        
            } catch (error) {
                console.error("Cloning Error:", error);
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
                addLog(`An error occurred: ${errorMessage}`, LogType.ERROR);
                setCloningState(CloningState.ERROR);
            }
        };

        const handleStreamedAction = (action: any, currentUrl: string): boolean => { // returns true to stop
            switch (action.action) {
                case 'thought': addLog(action.content, LogType.THOUGHT); break;
                case 'file':
                    addLog(`Creating file: ${action.path}`, LogType.INFO);
                    setFileSystem(prevFs => {
                        const newFs = { ...prevFs };
                        addFileToSystem(newFs, action.path, action.content);
                        return newFs;
                    });
                    if (action.path.endsWith('.html') && mainHtmlContent === null) {
                        setMainHtmlContent(consoleCaptureScript + action.content);
                    }
                    break;
                case 'authWall':
                    addLog(`AI Agent: "${action.message}"`, LogType.WARN);
                    setAuthUrl(currentUrl);
                    setCloningState(CloningState.AWAITING_USER_INPUT);
                    return true;
                case 'nextPage':
                    try {
                        const nextUrl = new URL(action.url, currentUrl).href;
                        setCloningQueue(prev => {
                            if (!visitedUrls.has(nextUrl) && !prev.some(j => j.url === nextUrl) && prev.length + visitedUrls.size < 5) {
                                addLog(`AI queued next page: ${nextUrl}`, LogType.INFO);
                                return [...prev, { url: nextUrl }];
                            }
                            return prev;
                        });
                    } catch (e) {
                        addLog(`AI returned an invalid next page URL: ${action.url}`, LogType.WARN);
                    }
                    break;
                case 'complete': addLog(action.message, LogType.SUCCESS); break;
                default: addLog(`Unknown AI action: ${JSON.stringify(action)}`, LogType.WARN);
            }
            return false;
        };

        processQueue();
    }, [cloningState, cloningQueue]);

    useEffect(() => {
        if (cloningState === CloningState.CLONING && cloningQueue.length === 0 && visitedUrls.size > 0) {
            addLog(`Initial cloning phase complete. Cloned ${visitedUrls.size} page(s). Starting AI quality review...`, LogType.SYSTEM);
            setCloningState(CloningState.QUALITY_CHECK);
        }
    }, [cloningState, cloningQueue.length, visitedUrls.size, addLog]);

    useEffect(() => {
        if (cloningState === CloningState.QUALITY_CHECK) {
            handleQualityCheck();
        }
    }, [cloningState, handleQualityCheck]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'console-error') {
                setConsoleErrors(prev => {
                    const errorExists = prev.some(e => e.includes(event.data.message));
                    return errorExists ? prev : [...prev, event.data.message];
                });
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        if (consoleErrors.length > 0 &&
            (cloningState === CloningState.COMPLETED || cloningState === CloningState.ERROR) &&
            fixAttempts < MAX_FIX_ATTEMPTS) {
            
            addLog(`Detected ${consoleErrors.length} console error(s). Attempting to auto-fix... (Attempt ${fixAttempts + 1}/${MAX_FIX_ATTEMPTS})`, LogType.SYSTEM);
            handleAutoFix(consoleErrors);
        } else if (consoleErrors.length > 0 && fixAttempts >= MAX_FIX_ATTEMPTS && cloningState !== CloningState.FIXING) {
            addLog(`Max auto-fix attempts reached. Please fix the remaining errors manually.`, LogType.WARN);
            setCloningState(CloningState.ERROR); // Final state is error
        }
    }, [consoleErrors, cloningState, fixAttempts, handleAutoFix]);


    return (
        <div className="h-screen w-screen flex flex-col bg-primary font-sans">
            <Header onInitiateCloning={handleInitiateCloning} isLoading={cloningState === CloningState.CLONING || cloningState === CloningState.FIXING || cloningState === CloningState.QUALITY_CHECK} />
            <main className="flex-grow grid grid-cols-12 gap-4 p-4 overflow-hidden">
                <div className="col-span-2 bg-secondary rounded-lg border border-border-color overflow-y-auto">
                    <FileExplorer 
                        fileSystem={fileSystem} 
                        onFileSelect={setActiveFile} 
                        activeFilePath={activeFile?.path}
                    />
                </div>
                <div className="col-span-6 bg-secondary rounded-lg border border-border-color flex flex-col">
                    {activeFile ? <CodeEditor file={activeFile} /> : <PreviewWindow htmlContent={mainHtmlContent} />}
                </div>
                <div className="col-span-4 bg-secondary rounded-lg border border-border-color flex flex-col">
                    <RightPanel 
                        logs={agentLogs} 
                        consoleErrors={consoleErrors} 
                        isFixing={cloningState === CloningState.FIXING}
                        urlToClone={urlToClone}
                    />
                </div>
            </main>
            {isScreenshotModalOpen && (
                <ScreenshotModal
                    targetUrl={urlToClone}
                    onScreenshotReady={handleScreenshotReady}
                    onCancel={() => setIsScreenshotModalOpen(false)}
                />
            )}
            {cloningState === CloningState.AWAITING_USER_INPUT && (
                <AuthPrompt
                    targetUrl={authUrl}
                    onResume={handleResumeCloning}
                    onCancel={() => {
                        addLog("User cancelled authentication. Cloning stopped.", LogType.WARN);
                        setCloningState(CloningState.ERROR);
                    }}
                />
            )}
        </div>
    );
};

export default App;
