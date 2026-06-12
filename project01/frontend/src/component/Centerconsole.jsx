import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, addEdge, Handle, Position } from '@xyflow/react';
import { useDispatch, useSelector } from 'react-redux';
import { setClickedNodeId, clearClickedNodeId, setSelectedNodeLabel, setIntMap } from '../store/flowSlice';
import { FaBrain, FaICursor, FaPlay, FaStop } from "react-icons/fa";
import { CiVoicemail } from "react-icons/ci";
import '@xyflow/react/dist/style.css';
import { ToastContainer, toast } from 'react-toastify';

// Mapping labels to corresponding icons
const iconMap = {
  'Email_Suggest':       <FaBrain className="w-5 h-5" />,
  'mail_to_user':        <CiVoicemail className="w-5 h-5 text-indigo-500 font-bold" />,
  'Resume_Reviewer':     <FaICursor className="w-5 h-5 text-teal-500" />,
  'Cover_Letter':        <FaBrain className="w-5 h-5 text-pink-500" />,
  'Important_Questions': <span style={{fontSize:'14px'}}>❓</span>,
  'MCQ_Generator':       <span style={{fontSize:'14px'}}>📝</span>,
  'Study_Planner':       <span style={{fontSize:'14px'}}>📅</span>,
  'START':               <FaPlay className="w-3 h-3 text-green-500" />,
  'END':                 <FaStop className="w-3 h-3 text-red-500" />,
};

// Custom React Flow node component rendering Name, Icon and Active state indicator
const CustomNode = ({ data, selected }) => {
  const label = data.label || '';
  const icon = iconMap[label] || <FaBrain className="w-5 h-5" />;
  const isSelected = selected;
  const displayName = label === 'START' ? 'Start' : label === 'END' ? 'End' : label.replaceAll('_', ' ');

  return (
    <div className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 min-w-[200px] ${isSelected
        ? 'border-blue-500 bg-blue-50/95 text-blue-900 shadow-md scale-[1.02]'
        : 'border-gray-200 bg-white text-gray-800 shadow-sm hover:shadow-md'
      }`}>
      {label !== 'START' && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: '#3b82f6', width: 8, height: 8 }}
        />
      )}
      <div className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${isSelected ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'
        }`}>
        {icon}
      </div>
      <div className="flex-grow flex flex-col items-start">
        <span className={`text-xs font-semibold capitalize ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
          {displayName}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
          <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
            {isSelected ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
      {label !== 'END' && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: '#3b82f6', width: 8, height: 8 }}
        />
      )}
    </div>
  );
};

// Declaring custom node type mapping
const nodeTypes = {
  customNode: CustomNode,
};

const Centerconsole = () => {
  const dispatch = useDispatch();
  const clickedNodeId = useSelector((state) => state.flow.clickedNodeId);
  const addedNodeIds = useSelector((state) => state.flow.addedNodeIds);
  const userEmail = useSelector((state) => state.flow.userEmail); // ← Hook auth state for sync

  const [nodes, setNodes] = useState([
    { id: '3', position: { x: 150, y: 50 }, data: { label: 'START' }, type: 'customNode' },
    { id: '4', position: { x: 150, y: 450 }, data: { label: 'END' }, type: 'customNode' }
  ]);
  const [edges, setEdges] = useState([]);
  const [finalmapping, setfinalMapping] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [registry, setRegistry] = useState({});

  // Fetch node definitions/labels registry from backend
  useEffect(() => {
    const fetchRegistry = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/pre-fun`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log("registry fetched:", result);
        setRegistry(result);
      } catch (err) {
        console.error("error fetching registry:", err);
      }
    };
    fetchRegistry();
  }, []);

  // Sync canvas nodes and edges state with addedNodeIds list from Redux
  useEffect(() => {
    if (Object.keys(registry).length === 0) return;

    // Filter out nodes that are no longer in addedNodeIds
    setNodes((prevNodes) => {
      const filteredPrev = prevNodes.filter((node) => addedNodeIds.includes(node.id));
      const existingIds = filteredPrev.map((node) => node.id);
      const newIds = addedNodeIds.filter((id) => !existingIds.includes(id));

      const newNodes = newIds.map((id, index) => {
        const name = registry[id] || 'Workflow Node';
        const xPos = 150 + (filteredPrev.length % 3) * 30;
        const yPos = 100 + (filteredPrev.length + index) * 100;
        return {
          id: id,
          position: { x: xPos, y: yPos },
          data: { label: name },
          type: 'customNode'
        };
      });

      return [...filteredPrev, ...newNodes];
    });

    // Proactively clean up edges that contain any deleted node
    setEdges((prevEdges) =>
      prevEdges.filter((edge) =>
        addedNodeIds.includes(edge.source) && addedNodeIds.includes(edge.target)
      )
    );
  }, [addedNodeIds, registry]);

  // Real-time progress auto-saver: persists canvas to backend whenever it changes
  useEffect(() => {
    if (!userEmail) return;
    const saveCanvasState = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/canvas/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, addedNodeIds }),
        });
        if (!res.ok) {
          print("Failed to auto-save canvas state.");
        }
      } catch (err) {
        console.error("Error auto-saving canvas state:", err);
      }
    };
    saveCanvasState();
  }, [addedNodeIds, userEmail]);

  // Sync selectedNode (overlay details panel) when clickedNodeId changes
  useEffect(() => {
    if (clickedNodeId) {
      const foundNode = nodes.find(node => node.id === clickedNodeId);
      if (foundNode) {
        setSelectedNode(foundNode.data.label);
      }
    } else {
      setSelectedNode(null);
    }
  }, [clickedNodeId, nodes]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    []
  );

  const onConnect = useCallback(
    (params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    []
  );

  const onNodeclick = useCallback((event, node) => {
    console.log("node clicked on canvas:", node);
    dispatch(setClickedNodeId(node.id));
    dispatch(setSelectedNodeLabel(node.data.label));
  }, [dispatch]);

  const processchanges = useCallback((edges) => {
    let finalmapping = [];
    edges.forEach(({ source, target }) => {
      if (finalmapping.length === 0 || finalmapping[finalmapping.length - 1] !== source) {
        finalmapping.push(source);
      }
      finalmapping.push(target);
    });
    setfinalMapping(finalmapping);
    // Sync to Redux so Rightmodule can use it
    dispatch(setIntMap(finalmapping.map(id => parseInt(id))));
  }, [dispatch]);

  useEffect(() => {
    processchanges(edges);
  }, [edges, processchanges]);


  // Derive highlight styles for nodes dynamically
  const nodesWithHighlight = useMemo(() => {
    return nodes.map((node) => {
      const isSelected = node.id === clickedNodeId;
      return {
        ...node,
        selected: isSelected,
      };
    });
  }, [nodes, clickedNodeId]);

  return (
    <div
      className="h-[calc(100vh-60px)] w-[70%] relative flex flex-col border-r border-gray-200"
      style={{
        backgroundColor: "#f9fafb",
        backgroundImage: `
          linear-gradient(#e5e7eb 1px, transparent 1px),
          linear-gradient(90deg, #e5e7eb 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }}
    >
      <div className="w-full h-full relative">
        <ReactFlow
          nodes={nodesWithHighlight}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeclick}
          onConnect={onConnect}
          fitView
          style={{ background: 'transparent' }}
        />

      </div>
      <ToastContainer />
    </div>
  );
};

export default Centerconsole;