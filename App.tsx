
import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
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
        addLog("Initializing Full-Stack Agentic Cloner v5.1...", LogType.SYSTEM);
        
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
    
    const clonePage = async (job: { url: string; screenshot?: File }, currentFileSystem: FileSystem) => {
        const { url, screenshot } = job;
        const MAX_PAGES = 5;

        if (visitedUrls.has(url) || visitedUrls.size >= MAX_PAGES) {
            return { newFileSystem: currentFileSystem, nextUrl: null };
        }

        setVisitedUrls(prev => new Set(prev).add(url));
        addLog(`Cloning page (${visitedUrls.size + 1}/${MAX_PAGES}): ${url}`, LogType.SYSTEM);

        addLog(`Fetching source code for ${url}...`, LogType.INFO);
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const fetchResponse = await fetch(proxyUrl);
        if (!fetchResponse.ok) throw new Error(`Failed to fetch URL ${url}. Status: ${fetchResponse.status}.`);
        const htmlContent = await fetchResponse.text();
        addLog("Successfully fetched page source.", LogType.SUCCESS);
        
        const assetUrls = Array.from(htmlContent.matchAll(/<link[^>]+href="([^"]+\.css)"|<script[^>]+src="([^"]+\.js)"/g))
            .map(match => match[1] || match[2])
            .filter(Boolean)
            .map(assetPath => new URL(assetPath, url).href);

        const assets: { path: string; content: string }[] = [];
        if (assetUrls.length > 0) {
            addLog(`Found ${assetUrls.length} assets (CSS/JS). Fetching...`, LogType.INFO);
            await Promise.all(assetUrls.map(async assetUrl => {
                try {
                    const assetProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(assetUrl)}`;
                    const assetResponse = await fetch(assetProxy);
                    if (assetResponse.ok) {
                        const content = await assetResponse.text();
                        assets.push({ path: assetUrl, content });
                        addLog(`Fetched asset: ${assetUrl}`, LogType.SUCCESS);
                    } else {
                         addLog(`Failed to fetch asset: ${assetUrl}`, LogType.WARN);
                    }
                } catch (e) {
                     addLog(`Error fetching asset ${assetUrl}: ${(e as Error).message}`, LogType.ERROR);
                }
            }));
        }

        addLog(screenshot ? "Dispatching Multimodal AI agent with full asset context." : "Dispatching HTML-only AI agent with full asset context.", LogType.SYSTEM);
        
        let imagePart;
        if (screenshot) {
            const imageBase64 = await fileToBase64(screenshot);
            imagePart = { inlineData: { mimeType: screenshot.type, data: imageBase64 } };
        }
        
        const assetsContentString = assets.map(a => `\n\n--- Asset: ${a.path} ---\n\`\`\`\n${a.content}\n\`\`\``).join('');

        const prompt = `
You are a world-class AI developer agent. Your mission is to clone a web application with high fidelity, creating a complete, runnable project structure including frontend files and a mock backend server.

**INPUT:**
You will be provided with:
1. The main HTML source of a web page.
2. The source code of its linked CSS and JavaScript files.
3. (Optional) A screenshot of the page for visual context.
4. A list of files that already exist in the project.

**PROCEDURE:**

1.  **Analyze & Plan (Thought Process):**
    *   First, formulate a step-by-step plan for how you will deconstruct the page.
    *   Consider the overall layout, components (header, footer, sidebar, cards, forms), and functionality.
    *   Determine a logical file and directory structure (e.g., placing all frontend assets in a \`public\` directory).
    *   Detail this plan in the \`thoughtProcess\` field of your response.

2.  **Authentication Wall Detection:**
    *   Analyze the page to determine if it is primarily for login, signup, or authentication.
    *   If it IS an authentication page:
        *   Set \`isAuthWall\` to \`true\`.
        *   Set \`messageForUser\` to a helpful message like "I've encountered a login page. To proceed, please sign in to the application and provide the URL of the page you land on after logging in."
        *   Set \`thoughtProcess\` to "Detected an authentication wall. Halting file generation and awaiting user action."
        *   Provide an empty \`files\` array and empty \`backendFiles\` array.
        *   Do NOT proceed with any other steps.

3.  **Frontend Reconstruction:**
    *   If it's NOT an auth wall, proceed to reconstruct the frontend.
    *   Create a clean, well-structured \`index.html\` file (or a more descriptive name like \`dashboard.html\` if it's a secondary page) and place it in a \`public\` directory. Ensure this HTML file correctly links to any CSS and JavaScript files you also create, using relative paths (e.g., \`<link rel="stylesheet" href="/css/style.css">\`).
    *   Separate CSS into files like \`public/css/style.css\`.
    *   Separate JavaScript into files like \`public/js/script.js\`.
    *   **Asset Handling:** For images (\`<img>\`), fonts, and other assets referenced via URL, ensure their \`src\` or \`href\` attributes are absolute URLs pointing to the original source. This ensures they render correctly in the preview. Do not try to create local copies of these binary assets.
    *   Merge and refactor the provided code for clarity and good practice.

4.  **Backend Inference & Generation:**
    *   Scrutinize the JavaScript code for any API calls (e.g., \`fetch('/api/users')\`, \`axios.post('/api/auth')\`).
    *   Based on these calls, infer the API routes, HTTP methods, and the likely data schemas.
    *   Generate a \`server.js\` file using Node.js and Express at the root level. This server should create mock API endpoints that match your inferences.
    *   The server should also serve the static files from the \`public\` directory.
    *   For GET requests, return plausible, varied sample data (e.g., an array of 3-5 objects).
    *   For POST/PUT/DELETE requests, simply return a success message.
    *   Generate a \`package.json\` file at the root with necessary dependencies like \`express\` and \`cors\`.
    *   Generate a \`README.md\` file at the root. It must explain the project structure and provide clear, copy-pasteable terminal commands for a user to install dependencies (\`npm install\`) and run the server (\`node server.js\`).

5.  **Plan Next Step:**
    *   Examine the page for the most logical internal link a user would click to navigate deeper into the application's core functionality (e.g., a "Dashboard" link after login, "View Profile", "Open Project").
    *   Exclude non-essential links like "Terms of Service", "Privacy Policy", "Sign Out", or external sites.
    *   Provide the full, absolute URL for this link in the \`nextPageUrl\` field. If no such link exists, set it to \`null\`.

**OUTPUT SCHEMA:**
Respond with a single JSON object matching the provided schema. Do not add any explanatory text, comments, or markdown formatting outside the JSON structure.`;
        
        const existingFiles = Object.keys(currentFileSystem);
        const textPart = { text: `Prompt: ${prompt}\n\nExisting Files: [${existingFiles.join(', ')}]\n\nHTML Content for ${url}:\n\`\`\`html\n${htmlContent}\n\`\`\`` + assetsContentString };
        const contents = imagePart ? { parts: [textPart, imagePart] } : textPart.text;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        thoughtProcess: { type: Type.STRING, description: "The agent's step-by-step plan for cloning the page." },
                        isAuthWall: { type: Type.BOOLEAN },
                        messageForUser: { type: Type.STRING },
                        files: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { path: { type: Type.STRING }, content: { type: Type.STRING } },
                                required: ["path", "content"],
                            },
                        },
                        backendFiles: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { path: { type: Type.STRING }, content: { type: Type.STRING } },
                                required: ["path", "content"],
                            },
                        },
                        nextPageUrl: { type: Type.STRING, description: "Full URL of the next page. Set to null or omit." }
                    },
                    required: ["thoughtProcess", "isAuthWall", "messageForUser", "files", "backendFiles"],
                },
            },
        });
        
        addLog("AI analysis complete. Processing results.", LogType.SUCCESS);
        const result = JSON.parse(response.text);

        if (result.thoughtProcess) {
            addLog(result.thoughtProcess, LogType.THOUGHT);
        }

        addLog(`AI Agent: "${result.messageForUser}"`, result.isAuthWall ? LogType.WARN : LogType.SYSTEM);

        if (result.isAuthWall) {
            setAuthUrl(url);
            setCloningState(CloningState.AWAITING_USER_INPUT);
            return { newFileSystem: currentFileSystem, nextUrl: null, stop: true };
        }
        
        let newFileSystem = { ...currentFileSystem };
        const allFiles = [...(result.files || []), ...(result.backendFiles || [])];

        if (allFiles.length === 0) {
            addLog("AI did not return any files for this page.", LogType.WARN);
        } else {
             addLog(`Reconstructing file system for ${url}.`, LogType.INFO);
            for (const file of allFiles) {
                addFileToSystem(newFileSystem, file.path, file.content);
                if (file.path.endsWith('.html') && mainHtmlContent === null) {
                    setMainHtmlContent(consoleCaptureScript + file.content);
                }
                addLog(`Created/Updated file: ${file.path}`, LogType.INFO);
            }
        }

        let nextUrl = null;
        if (result.nextPageUrl) {
            try {
                nextUrl = new URL(result.nextPageUrl, url).href;
            } catch (e) {
                addLog(`AI returned an invalid next page URL: ${result.nextPageUrl}`, LogType.WARN);
            }
        }
        return { newFileSystem, nextUrl, stop: false };
    };
    
    const handleAutoFix = async (errors: string[]) => {
        setCloningState(CloningState.FIXING);
        setFixAttempts(prev => prev + 1);
        setConsoleErrors([]); // Clear errors for the next run
    
        addLog(`Analyzing ${errors.length} console error(s)...`, LogType.DEBUG);
    
        const prompt = `
    You are an expert AI developer debugging a web application. You will be given the full source code of the application and a list of console errors from the browser's preview.
    
    **Task:**
    1.  Analyze the provided console errors.
    2.  Analyze the full application source code to find the root cause of the errors.
    3.  Fix the bug(s) by modifying the necessary files. Provide the FULL, complete content for any file you change. Do not provide diffs or partial code.
    4.  Provide a brief analysis of the problem and your solution.
    
    **Input:**
    *   **Console Errors:**
        \`\`\`
        ${errors.join('\n')}
        \`\`\`
    *   **Source Code:**
        ${getFileSystemAsText(fileSystem).join('\n\n')}
    
    **Output:**
    Respond with a single JSON object matching the provided schema. Do not add any explanatory text outside the JSON structure.`;
    
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            analysis: { type: Type.STRING, description: "A brief explanation of the error and your fix." },
                            filesToUpdate: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        path: { type: Type.STRING, description: "The full path of the file to update." },
                                        content: { type: Type.STRING, description: "The full, corrected content of the file." }
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
                if (file.path.endsWith('.html')) { // A crude check to see if the main HTML was updated
                    setMainHtmlContent(consoleCaptureScript + file.content);
                    htmlUpdated = true;
                }
            }
            
            setFileSystem(updatedFileSystem);
            if (!htmlUpdated) { // Force a re-render of iframe if HTML was not the file changed
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
    };
    

    useEffect(() => {
        const processQueue = async () => {
            if (cloningState === CloningState.CLONING && cloningQueue.length > 0) {
                const job = cloningQueue.shift()!;
                 if (visitedUrls.has(job.url)) {
                    setCloningQueue([...cloningQueue]); // Trigger next iteration
                    return;
                }

                try {
                    const result = await clonePage(job, fileSystem);
                    setFileSystem(result.newFileSystem);

                    if (result.stop) {
                        return; // Halt processing for user input
                    }

                    const newQueue = [...cloningQueue];
                    if (result.nextUrl && !visitedUrls.has(result.nextUrl) && !newQueue.some(j => j.url === result.nextUrl)) {
                        addLog(`AI identified next page to clone: ${result.nextUrl}`, LogType.INFO);
                        newQueue.push({ url: result.nextUrl });
                    }
                    
                    if (newQueue.length === 0 || visitedUrls.size >= 5) {
                        addLog(`Cloning process complete. Cloned ${visitedUrls.size + 1} page(s). Now monitoring for errors.`, LogType.SUCCESS);
                        setCloningState(CloningState.COMPLETED);
                    }
                    setCloningQueue(newQueue);

                } catch (error) {
                    console.error("Cloning Error:", error);
                    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
                    addLog(`An error occurred: ${errorMessage}`, LogType.ERROR);
                    setCloningState(CloningState.ERROR);
                }
            }
        };

        processQueue();
    }, [cloningState, cloningQueue]);

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
    }, [consoleErrors, cloningState, fixAttempts]);


    return (
        <div className="h-screen w-screen flex flex-col bg-primary font-sans">
            <Header onInitiateCloning={handleInitiateCloning} isLoading={cloningState === CloningState.CLONING || cloningState === CloningState.FIXING} />
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
