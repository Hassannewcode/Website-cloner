
import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Header } from './components/Header';
import { FileExplorer } from './components/FileExplorer';
import { PreviewWindow } from './components/PreviewWindow';
import { CodeEditor } from './components/CodeEditor';
import { AgentLog } from './components/AgentLog';
import { ScreenshotModal } from './components/ScreenshotModal';
import { AuthPrompt } from './components/AuthPrompt';
import { CloningState, FileSystem, AgentLogEntry, LogType } from './types';

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
    
    const handleInitiateCloning = (url: string, useScreenshot: boolean) => {
        if (!url || cloningState !== CloningState.IDLE && cloningState !== CloningState.COMPLETED && cloningState !== CloningState.ERROR) return;

        setCloningState(CloningState.CLONING);
        setAgentLogs([]);
        setFileSystem({});
        setActiveFile(null);
        setMainHtmlContent(null);
        setVisitedUrls(new Set());
        addLog("Initializing Full-Stack Agentic Cloner v5.0...", LogType.SYSTEM);
        
        setUrlToClone(url);
        if (useScreenshot) {
            window.open(url, '_blank', 'noopener,noreferrer');
            setIsScreenshotModalOpen(true);
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
        
        // Asset Discovery and Fetching
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
You are a world-class AI developer agent tasked with cloning a web application, including its frontend and a inferred mock backend.

**Core Task:**
Your goal is to deconstruct a provided web page into a complete project structure. You will be given the page's main HTML, and the source code of its linked CSS and JavaScript files. You must also infer backend functionality from the frontend code.

**Instructions:**

1.  **Authentication Wall Detection:**
    *   First, analyze the page to determine if it is a login, signup, or authentication-related page.
    *   If it IS an authentication page:
        *   Set \`isAuthWall\` to \`true\`.
        *   Set \`messageForUser\` to a message like "I've encountered a login page. Please sign in to the application so I can continue."
        *   Provide an empty \`files\` array and empty \`backendFiles\` array.
        *   Do NOT proceed with any other steps.

2.  **Frontend Reconstruction:**
    *   If it's NOT an auth wall, analyze all provided source code (HTML, CSS, JS).
    *   Reconstruct the file system. Use a logical structure (e.g., \`index.html\`, \`css/style.css\`, \`js/script.js\`, \`assets/\`).
    *   If you are processing a secondary page (e.g., a dashboard), name the HTML file descriptively (e.g., \`dashboard.html\`) and merge shared styles/scripts logically.
    *   Ensure the generated code is clean, well-formatted, and complete.

3.  **Backend Inference & Generation:**
    *   Scrutinize the JavaScript code for any API calls (e.g., \`fetch('/api/users')\`, \`axios.post('/api/auth')\`).
    *   Based on these calls, infer the API routes, HTTP methods, and the likely data schemas for requests and responses.
    *   Generate a \`server.js\` file using Node.js and Express. This server should create mock API endpoints that match your inferences. For a GET request, return plausible sample data. For POST/PUT, simply return a success message.
    *   Generate a \`package.json\` file with necessary dependencies like \`express\` and \`cors\`.

4.  **Plan Next Step:**
    *   Identify the single most logical internal link a user would click to navigate deeper into the app (e.g., "Dashboard", "View Profile").
    *   Exclude non-essential links like "Terms of Service" or external sites.
    *   Provide the full, absolute URL for this link in the \`nextPageUrl\` field. If no such link exists, set it to \`null\`.

**Output:**
Respond with a single JSON object matching the provided schema. Do not add any explanatory text outside the JSON structure.`;
        
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
                    required: ["isAuthWall", "messageForUser", "files", "backendFiles"],
                },
            },
        });
        
        addLog("AI analysis complete. Processing results.", LogType.SUCCESS);
        const result = JSON.parse(response.text);

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
                if (file.path.endsWith('.html') && mainHtmlContent === null) setMainHtmlContent(file.content);
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
                        addLog(`Cloning process complete. Cloned ${visitedUrls.size + 1} page(s).`, LogType.SUCCESS);
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


    return (
        <div className="h-screen w-screen flex flex-col bg-primary font-sans">
            <Header onInitiateCloning={handleInitiateCloning} isLoading={cloningState === CloningState.CLONING} />
            <main className="flex-grow grid grid-cols-12 gap-4 p-4 overflow-hidden">
                <div className="col-span-2 bg-secondary rounded-lg border border-border-color overflow-y-auto">
                    <FileExplorer fileSystem={fileSystem} onFileSelect={setActiveFile} />
                </div>
                <div className="col-span-6 bg-secondary rounded-lg border border-border-color flex flex-col">
                    {activeFile ? <CodeEditor file={activeFile} /> : <PreviewWindow htmlContent={mainHtmlContent} />}
                </div>
                <div className="col-span-4 bg-secondary rounded-lg border border-border-color flex flex-col">
                    <AgentLog logs={agentLogs} />
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
