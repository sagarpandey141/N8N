import { useState, useCallback, useMemo, useEffect } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { useDispatch, useSelector } from 'react-redux';
import { setClickedNodeId, clearClickedNodeId } from '../store/flowSlice';
import '@xyflow/react/dist/style.css';
import { ToastContainer, toast } from 'react-toastify';

export default function Flow() {
  const dispatch = useDispatch();
  const clickedNodeId = useSelector((state) => state.flow.clickedNodeId);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [finalmapping, setfinalMapping] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [query, setQuery] = useState('');
  const [email, setUseremail] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/pre-fun`);

        // Fetch doesn't throw errors for 404/500, so we check response.ok
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log("resut", result);
        const newNodes = Object.entries(result).map(([id, name], index) => ({
          id: String(id),
          position: { x: 100, y: index * 120 },
          data: { label: name }
        }));
        setNodes(newNodes);
      } catch (err) {
        console.log("error", err);
      }
    };

    fetchData();
  }, []); // Empty array ensures this runs once on mount

  // Sync selectedNode when clickedNodeId changes from Redux (e.g. from LeftModule)
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
    [],
  );

  function onNodeclick(event, node) {
    console.log("node", node);
    dispatch(setClickedNodeId(node.id));
  }

  function processchanges(edges) {
    let finalmapping = [];
    edges.map(({ id, source, target }) => {
      console.log(edges[edges.length - 1], source);
      if (finalmapping[finalmapping.length - 1] !== source) {
        finalmapping.push(source);
      }
      finalmapping.push(target);
    });
    setfinalMapping(finalmapping);
  }

  const onEdgesChange = useCallback(
    (changes) => {
      setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot));
    },
    [],
  );

  const onConnect = useCallback(
    (params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );

  async function handleRunQuery() {
    const data = {
      state: {
        query: query,
        email: email || null
      },
      int_map: finalmapping.map(id => parseInt(id))
    };
    console.log(JSON.stringify(data));
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (response.ok) {
      toast("done");
    }
    const result = await response.json();
    console.log("detail:", JSON.stringify(result, null, 2));
  }

  useEffect(() => {
    processchanges(edges);
  }, [edges]);

  // Derive nodes with highlight styles applied dynamically
  const nodesWithHighlight = useMemo(() => {
    return nodes.map((node) => {
      const isSelected = node.id === clickedNodeId;
      return {
        ...node,
        selected: isSelected,
        style: {
          ...node.style,
          transition: 'all 0.3s ease',
          borderRadius: '8px',
          padding: '10px 14px',
          ...(isSelected
            ? {
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '2.5px solid #2563eb',
              boxShadow: '0 0 20px rgba(37, 99, 235, 0.45)',
              fontWeight: 'bold',
              color: '#1e40af',
              transform: 'scale(1.05)',
            }
            : {
              background: '#ffffff',
              border: '1px solid #d1d5db',
              color: '#374151',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }),
        },
      };
    });
  }, [nodes, clickedNodeId]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodesWithHighlight}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeclick}
        onConnect={onConnect}
        fitView
      />
      {selectedNode === "Email_Suggest" && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          width: 300, background: '#fff', borderRadius: 10,
          border: '1px solid #ddd', padding: '1rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)', zIndex: 10,
        }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 14 }}>
            📌 {selectedNode}
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#666' }}>
            Please paste the JD
          </p>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your query for this node..."
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 13,
              padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc',
              resize: 'vertical', marginBottom: 8
            }}
          />
          <button
            onClick={handleRunQuery}
            style={{
              width: '100%', padding: '7px 0', fontWeight: 500,
              fontSize: 13, borderRadius: 6, border: '1px solid #bbb',
              cursor: 'pointer', background: '#f4f4f4'
            }}
          >
            Run Query
          </button>
          <button
            onClick={() => {
              setSelectedNode(null);
              dispatch(clearClickedNodeId());
            }}
            style={{
              width: '100%', marginTop: 6, padding: '5px 0',
              fontSize: 12, border: 'none', background: 'none',
              cursor: 'pointer', color: '#999'
            }}
          >
            close
          </button>
        </div>
      )}

      {selectedNode === "mail_to_user" && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          width: 300, background: '#fff', borderRadius: 10,
          border: '1px solid #ddd', padding: '1rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)', zIndex: 10,
        }}>
          <div>plase paste referral email </div>
          <textarea
            value={email}
            onChange={(e) => setUseremail(e.target.value)}
            placeholder="Type your query for this node..."
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 13,
              padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc',
              resize: 'vertical', marginBottom: 8
            }}
          />
          <button
            onClick={handleRunQuery}
            style={{
              width: '100%', padding: '7px 0', fontWeight: 500,
              fontSize: 13, borderRadius: 6, border: '1px solid #bbb',
              cursor: 'pointer', background: '#f4f4f4'
            }}
          >
            Run Query
          </button>
          <button
            onClick={() => {
              setSelectedNode(null);
              dispatch(clearClickedNodeId());
            }}
            style={{
              width: '100%', marginTop: 6, padding: '5px 0',
              fontSize: 12, border: 'none', background: 'none',
              cursor: 'pointer', color: '#999'
            }}
          >
            close
          </button>
        </div>
      )}
      <ToastContainer />
    </div>
  );
}
