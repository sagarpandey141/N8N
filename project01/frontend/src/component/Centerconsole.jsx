import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, addEdge, Handle, Position } from '@xyflow/react';
import { useDispatch, useSelector } from 'react-redux';
import { setClickedNodeId, clearClickedNodeId, setSelectedNodeLabel, setIntMap, setFlowResult, removeNodeId } from '../store/flowSlice';
import { FaBrain, FaICursor, FaPlay, FaStop, FaTimes } from "react-icons/fa";
import { CiVoicemail } from "react-icons/ci";
import '@xyflow/react/dist/style.css';
import { ToastContainer, toast } from 'react-toastify';

// Mapping labels to corresponding icons
const iconMap = {
  'Email_Suggest': <FaBrain className="w-5 h-5" />,
  'mail_to_user': <CiVoicemail className="w-5 h-5 text-indigo-500 font-bold" />,
  'Resume_Reviewer': <FaICursor className="w-5 h-5 text-teal-500" />,
  'Cover_Letter': <FaBrain className="w-5 h-5 text-pink-500" />,
  'Important_Questions': <span style={{ fontSize: '14px' }}>❓</span>,
  'MCQ_Generator': <span style={{ fontSize: '14px' }}>📝</span>,
  'Study_Planner': <span style={{ fontSize: '14px' }}>📅</span>,
  'START': <FaPlay className="w-3 h-3 text-green-500" />,
  'END': <FaStop className="w-3 h-3 text-red-500" />,
};

// Custom React Flow node component rendering Name, Icon and Active state indicator
const CustomNode = ({ id, data, selected }) => {
  const dispatch = useDispatch();
  const label = data.label || '';
  const icon = iconMap[label] || <FaBrain className="w-5 h-5" />;
  const isSelected = selected;
  const displayName = label === 'START' ? 'Start' : label === 'END' ? 'End' : label.replaceAll('_', ' ');

  const handleRemove = (e) => {
    e.stopPropagation(); // prevent node selection
    dispatch(removeNodeId(id));
  };

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

      {/* Cut / Remove Icon (not for START/END) */}
      {label !== 'START' && label !== 'END' && (
        <button
          onClick={handleRemove}
          className="ml-auto text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-colors"
          title="Remove Node"
        >
          <FaTimes className="w-3 h-3" />
        </button>
      )}
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
  const userEmail = useSelector((state) => state.flow.userEmail);
  const inputs = useSelector((state) => state.flow.inputs); // All user inputs for flow execution

  const [nodes, setNodes] = useState([
    { id: '3', position: { x: 150, y: 50 }, data: { label: 'START' }, type: 'customNode' },
    { id: '4', position: { x: 150, y: 450 }, data: { label: 'END' }, type: 'customNode' }
  ]);
  const [edges, setEdges] = useState([]);
  const [finalmapping, setfinalMapping] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [registry, setRegistry] = useState({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

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

  // ── Connection Rules ─────────────────────────────────────────────────────────
  const onConnect = useCallback(
    (params) => {
      const { source, target } = params;

      // "Email Send" (id=2) can ONLY receive from "Email Suggest" (id=1) for now
      if (target === '2' && source !== '1') {
        const sourceNode = nodes.find(n => n.id === source);
        const sourceName = sourceNode?.data?.label?.replaceAll('_', ' ') || 'that node';
        toast.error(
          `❌ "Email Send" can only be used with "Email Suggest" for now. Cannot connect from "${sourceName}".`,
          { position: 'top-center' }
        );
        return; // Block the connection
      }

      setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot));
    },
    [nodes]
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

  // ── Run the entire flow ───────────────────────────────────────────────────
  const ACTION_NODE_ID = '2'; // mail_to_user
  const handleRunFlow = async () => {
    if (!finalmapping || finalmapping.length < 2) {
      toast.error('Connect nodes on the canvas first to define the flow order.');
      return;
    }
    const hasActionNode = finalmapping.includes(ACTION_NODE_ID);
    setRunning(true);
    setResult(null);
    setShowResult(false);
    dispatch(setFlowResult(null)); // clear previous result
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: {
            query: inputs.jd || '',
            Resume: inputs.resumeText || '',
            email: inputs.email || '',
            book_text: inputs.bookText || '',
          },
          int_map: finalmapping.map(id => parseInt(id)),
        }),
      });
      const data = await res.json();
      console.log('[RunFlow] result from backend:', data); // debug
      setResult(data);
      if (hasActionNode) {
        // Action node present → show bottom drawer on canvas
        setShowResult(true);
        toast.success('✅ Flow executed — check your email!');
      } else {
        // No action node → push result to Redux so right panel displays it
        dispatch(setFlowResult(data));
        toast.success('✅ Flow executed! See results in the right panel.');
      }
    } catch {
      toast.error('❌ Failed to connect to backend.');
    } finally {
      setRunning(false);
    }
  };

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
      className="h-[calc(100vh-60px)] w-[70%] relative flex flex-col border-r border-slate-800"
      style={{
        backgroundColor: "#0f172a",
        backgroundImage: `
          linear-gradient(#1e293b 1px, transparent 1px),
          linear-gradient(90deg, #1e293b 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }}
    >
      {/* ── Top toolbar with Run Flow button ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3
        bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl px-4 py-2 shadow-md">
        <span className="text-[11px] text-gray-400 font-mono hidden sm:block">
          {finalmapping.length > 0
            ? `Flow: [${finalmapping.join(' → ')}]`
            : 'No flow — connect nodes'}
        </span>
        <button
          id="run-flow-btn"
          onClick={handleRunFlow}
          disabled={running}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-xl font-semibold text-sm
            transition-all duration-200
            ${running
              ? 'bg-blue-300 text-white cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-sm'
            }`}
        >
          {running ? (
            <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Running…</>
          ) : (
            <><FaPlay className="w-3 h-3" />Run Flow</>
          )}
        </button>
      </div>

      {/* ── React Flow canvas ── */}
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

      {/* ── Result Drawer (slides up from bottom) ── */}
      {showResult && result && (
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-white border-t-2 border-blue-100
          shadow-2xl rounded-t-2xl animate-slide-up">
          {/* Drawer header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Flow Result</span>
            </div>
            <button
              onClick={() => setShowResult(false)}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
              title="Close result"
            >×</button>
          </div>

          {/* Drawer body */}
          <div className="px-5 py-4 max-h-64 overflow-y-auto space-y-4 custom-scrollbar">
            {/* Email Suggest output */}
            {result.subject && (
              <div>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">📬 Subject</p>
                <p className="text-sm text-gray-800 font-medium">{result.subject}</p>
              </div>
            )}
            {result.body && (
              <div>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">📝 Email Body</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.body}</p>
              </div>
            )}

            {/* Study Planner output */}
            {result.study_plan && (
              <div>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">📅 Study Plan</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.study_plan}</p>
              </div>
            )}

            {/* Generic AI response (Resume Reviewer, Cover Letter, Questions, MCQs) */}
            {result.Ai_Response && !result.study_plan && (
              <div>
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">🤖 AI Response</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.Ai_Response}</p>
              </div>
            )}

            {/* mail_to_user — no visible output, just show success */}
            {!result.subject && !result.body && !result.study_plan && !result.Ai_Response && (
              <p className="text-sm text-gray-500 italic text-center py-2">Flow executed. Check your email if mail_to_user was in the flow.</p>
            )}
          </div>
        </div>
      )}

      <ToastContainer autoClose={2000} />
    </div>
  );
};

export default Centerconsole;