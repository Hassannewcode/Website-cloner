
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AgentLogEntry, LogType } from '../types';
import { ServerIcon } from './icons/ServerIcon';
import { PageIcon } from './icons/PageIcon';
import { FileCodeIcon } from './icons/FileCodeIcon';

type NodeType = 'url' | 'file';
type NodeState = 'cloning' | 'completed' | 'pending' | 'error';

interface Node {
    id: string;
    type: NodeType;
    label: string;
    state: NodeState;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface Link {
    source: string;
    target: string;
}

const useForceSimulation = (nodes: Node[], links: Link[], width: number, height: number) => {
    const nodeRef = useRef(nodes);
    const linkRef = useRef(links);
    const [simulationTick, setSimulationTick] = useState(0);
    
    nodeRef.current = nodes;
    linkRef.current = links;

    useEffect(() => {
        if (!width || !height) return;

        let frameId: number;

        const tick = () => {
            const currentNodes = nodeRef.current;
            const currentLinks = linkRef.current;
            
            // Simulation parameters
            const alpha = 0.5;
            const repulsionStrength = -500;
            const linkStrength = 0.5;
            const centerStrength = 0.05;

            // Apply forces
            for (const node of currentNodes) {
                // Center force
                node.vx += (width / 2 - node.x) * centerStrength * alpha;
                node.vy += (height / 2 - node.y) * centerStrength * alpha;
                
                // Repulsion force
                for (const otherNode of currentNodes) {
                    if (node === otherNode) continue;
                    const dx = otherNode.x - node.x;
                    const dy = otherNode.y - node.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = (repulsionStrength / distance) * alpha;
                    const forceX = (dx / distance) * force;
                    const forceY = (dy / distance) * force;
                    node.vx += forceX;
                    node.vy += forceY;
                }
            }
            
            // Link force (spring)
            for (const link of currentLinks) {
                const source = currentNodes.find(n => n.id === link.source);
                const target = currentNodes.find(n => n.id === link.target);
                if (!source || !target) continue;

                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const distance = Math.sqrt(dx*dx + dy*dy) || 1;
                const force = (distance - 100) * linkStrength * alpha;
                
                const forceX = (dx / distance) * force;
                const forceY = (dy / distance) * force;

                source.vx += forceX;
                source.vy += forceY;
                target.vx -= forceX;
                target.vy -= forceY;
            }

            // Update positions
            for (const node of currentNodes) {
                // Apply velocity with damping
                node.vx *= 0.9;
                node.vy *= 0.9;
                node.x += node.vx;
                node.y += node.vy;

                // Boundary collision
                node.x = Math.max(20, Math.min(width - 20, node.x));
                node.y = Math.max(20, Math.min(height - 20, node.y));
            }

            setSimulationTick(tick => tick + 1);
            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);

    }, [width, height]);
    
    return nodeRef;
};

export const AgentNetworkGraph: React.FC<{ logs: AgentLogEntry[], urlToClone: string }> = ({ logs, urlToClone }) => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [links, setLinks] = useState<Link[]>([]);
    const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [viewBox, setViewBox] = useState('0 0 100 100');
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (svgRef.current) {
            const { width, height } = svgRef.current.getBoundingClientRect();
            setDimensions({ width, height });
        }
    }, []);

    useEffect(() => {
        let currentUrl = '';
        const newNodes: Record<string, Node> = {};
        const newLinks: Record<string, Link> = {};

        if (urlToClone && !newNodes[urlToClone]) {
            newNodes[urlToClone] = { 
                id: urlToClone, type: 'url', label: new URL(urlToClone).hostname, 
                state: logs.length > 0 ? 'cloning' : 'pending',
                x: dimensions.width / 2 || 500, y: dimensions.height / 2 || 300, vx: 0, vy: 0 
            };
        }

        logs.forEach(log => {
            const cloningMatch = log.message.match(/Cloning page \((\d+)\/(\d+)\): (.*)/);
            if (cloningMatch) {
                currentUrl = cloningMatch[3];
                if (newNodes[currentUrl]) {
                    newNodes[currentUrl].state = 'cloning';
                }
            }

            const fileMatch = log.message.match(/Creating file: (.*)/);
            if (fileMatch && currentUrl) {
                const filePath = fileMatch[1];
                if (!newNodes[filePath]) {
                    newNodes[filePath] = { 
                        id: filePath, type: 'file', label: filePath.split('/').pop() || filePath, 
                        state: 'completed',
                        x: newNodes[currentUrl]?.x + Math.random() * 50 - 25 || 500,
                        y: newNodes[currentUrl]?.y + Math.random() * 50 - 25 || 300,
                        vx: 0, vy: 0
                    };
                    const linkId = `${currentUrl}->${filePath}`;
                    if (!newLinks[linkId]) {
                         newLinks[linkId] = { source: currentUrl, target: filePath };
                    }
                }
            }

            const nextMatch = log.message.match(/AI queued next page: (.*)/);
            if (nextMatch && currentUrl) {
                const nextUrl = nextMatch[1];
                if (!newNodes[nextUrl]) {
                    newNodes[nextUrl] = { 
                        id: nextUrl, type: 'url', label: new URL(nextUrl).hostname, 
                        state: 'pending',
                        x: newNodes[currentUrl]?.x + Math.random() * 50 - 25 || 500,
                        y: newNodes[currentUrl]?.y + Math.random() * 50 - 25 || 300,
                        vx: 0, vy: 0
                    };
                }
                const linkId = `${currentUrl}->${nextUrl}`;
                if (!newLinks[linkId]) {
                    newLinks[linkId] = { source: currentUrl, target: nextUrl };
                }
            }

            if (log.message.includes('AI Agent:') && log.message.includes('login page') && currentUrl && newNodes[currentUrl]) {
                newNodes[currentUrl].state = 'error';
            }
            if (log.message.includes('Finished processing') && currentUrl && newNodes[currentUrl]) {
                newNodes[currentUrl].state = 'completed';
            }
        });

        setNodes(Object.values(newNodes));
        setLinks(Object.values(newLinks));

    }, [logs, urlToClone, dimensions]);

    const simulatedNodesRef = useForceSimulation(nodes, links, dimensions.width, dimensions.height);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const scaleFactor = 1.1;
        const { k } = transform;
        const newK = e.deltaY < 0 ? k * scaleFactor : k / scaleFactor;
        
        const point = { x: e.clientX, y: e.clientY };
        const svgPoint = toSVGPoint(point);
        
        const dx = (svgPoint.x - transform.x) * (newK - k) / k;
        const dy = (svgPoint.y - transform.y) * (newK - k) / k;
        
        setTransform(t => ({ x: t.x - dx, y: t.y - dy, k: newK }));
    };

    const toSVGPoint = ({x, y}: {x: number, y: number}) => {
        if (!svgRef.current) return {x: 0, y: 0};
        const pt = svgRef.current.createSVGPoint();
        pt.x = x;
        pt.y = y;
        const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse());
        return svgP;
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        svgRef.current!.style.cursor = 'grabbing';
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        svgRef.current!.style.cursor = 'grab';
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const dx = (e.clientX - lastPos.current.x) / transform.k;
        const dy = (e.clientY - lastPos.current.y) / transform.k;
        setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const nodeColor = (state: NodeState) => {
        switch (state) {
            case 'cloning': return 'stroke-accent';
            case 'completed': return 'stroke-green-500';
            case 'pending': return 'stroke-gray-500';
            case 'error': return 'stroke-red-500';
        }
    };
    
    return (
        <div className="w-full h-full bg-primary relative overflow-hidden">
             <svg 
                ref={svgRef} 
                className="w-full h-full"
                style={{ cursor: 'grab' }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onMouseMove={handleMouseMove}
            >
                <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
                    {links.map((link, i) => (
                        <line 
                            key={i} 
                            x1={simulatedNodesRef.current.find(n => n.id === link.source)?.x} 
                            y1={simulatedNodesRef.current.find(n => n.id === link.source)?.y}
                            x2={simulatedNodesRef.current.find(n => n.id === link.target)?.x} 
                            y2={simulatedNodesRef.current.find(n => n.id === link.target)?.y}
                            className="stroke-border-color/50"
                            strokeWidth="1"
                        />
                    ))}
                    {simulatedNodesRef.current.map(node => (
                        <g 
                            key={node.id} 
                            transform={`translate(${node.x}, ${node.y})`}
                            onMouseEnter={() => setHoveredNode(node)}
                            onMouseLeave={() => setHoveredNode(null)}
                            className="transition-transform duration-100 ease-in-out"
                        >
                            <circle 
                                r="20" 
                                className={`fill-secondary transition-all ${nodeColor(node.state)}`}
                                strokeWidth="2"
                            />
                            {node.id === urlToClone ? <ServerIcon /> : (node.type === 'url' ? <PageIcon /> : <FileCodeIcon />)}
                        </g>
                    ))}
                </g>
             </svg>
            {hoveredNode && (
                <div 
                    className="absolute bg-secondary/90 border border-border-color rounded-md p-2 text-xs font-mono text-text-primary shadow-lg pointer-events-none"
                    style={{
                        left: `${(hoveredNode.x * transform.k) + transform.x + 25}px`, 
                        top: `${(hoveredNode.y * transform.k) + transform.y - 15}px`,
                        transform: `translate(${-50 * transform.k}%, 0)`
                    }}
                >
                    <p className="font-bold">{hoveredNode.type === 'url' ? 'URL' : 'File'}</p>
                    <p className="text-text-secondary break-all">{hoveredNode.id}</p>
                    <p className="mt-1"><span className={`capitalize font-semibold ${nodeColor(hoveredNode.state).replace('stroke-', 'text-')}`}>{hoveredNode.state}</span></p>
                </div>
            )}
             <div className="absolute bottom-2 left-2 bg-secondary/80 p-2 rounded-md text-xs text-text-secondary">
                <p>Nodes: {nodes.length} | Links: {links.length}</p>
                <p>Scroll to Zoom, Drag to Pan</p>
            </div>
        </div>
    );
};
