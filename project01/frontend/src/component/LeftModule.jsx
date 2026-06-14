import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { setClickedNodeId, setSelectedNodeLabel, addNodeId, removeNodeId, clearClickedNodeId } from '../store/flowSlice';

// ─── Node category metadata ───────────────────────────────────────────────────
// Maps each node label to its display info and category
const NODE_META = {
  // AI Nodes
  Email_Suggest: { icon: '🧠', label: 'Email Suggester', desc: 'Generate referral email from JD', category: 'ai', color: 'blue' },
  Resume_Reviewer: { icon: '📄', label: 'Resume Reviewer', desc: 'Get AI feedback on your resume', category: 'ai', color: 'teal' },
  Cover_Letter: { icon: '✍️', label: 'Cover Letter Writer', desc: 'Auto-generate a tailored cover letter', category: 'ai', color: 'purple' },
  Important_Questions: { icon: '❓', label: 'Important Q Suggester', desc: 'Upload PDF book → key questions', category: 'student', color: 'amber' },
  MCQ_Generator: { icon: '📝', label: 'MCQ Generator', desc: 'Create multiple-choice questions', category: 'student', color: 'green' },
  Study_Planner: { icon: '📅', label: 'Study Planner', desc: 'Build a personalised study plan', category: 'student', color: 'indigo' },
  // Actions
  mail_to_user: { icon: '📧', label: 'Email Send', desc: 'Send generated email to recipient', category: 'action', color: 'rose' },
};

const COLOR_MAP = {
  blue: { ring: 'bg-blue-100 text-blue-600', sel: 'bg-blue-600 text-white', badge: 'bg-blue-50 border-blue-200', selBadge: 'border-blue-500 bg-blue-50 shadow-md' },
  teal: { ring: 'bg-teal-100 text-teal-600', sel: 'bg-teal-600 text-white', badge: 'bg-teal-50 border-teal-200', selBadge: 'border-teal-500 bg-teal-50 shadow-md' },
  purple: { ring: 'bg-purple-100 text-purple-600', sel: 'bg-purple-600 text-white', badge: 'bg-purple-50 border-purple-200', selBadge: 'border-purple-500 bg-purple-50 shadow-md' },
  amber: { ring: 'bg-amber-100 text-amber-600', sel: 'bg-amber-600 text-white', badge: 'bg-amber-50 border-amber-200', selBadge: 'border-amber-500 bg-amber-50 shadow-md' },
  green: { ring: 'bg-green-100 text-green-600', sel: 'bg-green-600 text-white', badge: 'bg-green-50 border-green-200', selBadge: 'border-green-500 bg-green-50 shadow-md' },
  indigo: { ring: 'bg-indigo-100 text-indigo-600', sel: 'bg-indigo-600 text-white', badge: 'bg-indigo-50 border-indigo-200', selBadge: 'border-indigo-500 bg-indigo-50 shadow-md' },
  rose: { ring: 'bg-rose-100 text-rose-600', sel: 'bg-rose-600 text-white', badge: 'bg-rose-50 border-rose-200', selBadge: 'border-rose-500 bg-rose-50 shadow-md' },
};

// ─── Single Node Card ─────────────────────────────────────────────────────────
const NodeCard = ({ node, isSelected, isAdded, onClick }) => {
  const meta = NODE_META[node.data.label] || { icon: '🔷', label: node.data.label.replaceAll('_', ' '), desc: 'AI Workflow Node', color: 'blue' };
  const color = COLOR_MAP[meta.color] || COLOR_MAP.blue;

  return (
    <div
      onClick={onClick}
      className={`group cursor-pointer rounded-xl border-2 p-3 transition-all duration-200
        ${isSelected ? color.selBadge + ' scale-[1.02]' : 'border-gray-100 bg-white hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5'}
      `}
    >
      <div className="flex items-center gap-3">
        {/* Icon bubble */}
        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-lg flex-shrink-0 transition-all duration-200
          group-hover:scale-110 ${isSelected ? color.sel : color.ring}`}
        >
          {meta.icon}
        </div>

        {/* Text */}
        <div className="flex-grow min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className={`text-xs font-semibold truncate ${isSelected ? 'text-gray-900' : 'text-gray-800'}`}>
              {meta.label}
            </p>
            {isAdded && (
              <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">
                On Canvas
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug truncate">{meta.desc}</p>
        </div>
      </div>
    </div>
  );
};

// ─── Collapsible Category Section ────────────────────────────────────────────
const CategorySection = ({ title, emoji, count, children, defaultOpen = true, accentClass = 'text-gray-700' }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-1">
      {/* Category heading */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-150 group"
      >
        <span className="text-base">{emoji}</span>
        <span className={`text-[11px] font-bold uppercase tracking-widest ${accentClass} flex-grow text-left`}>
          {title}
        </span>
        <span className="text-[10px] bg-gray-200 text-gray-500 font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {count}
        </span>
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {/* Divider */}
      <div className="h-px bg-gray-100 mx-2 mb-2" />

      {/* Content */}
      {open && (
        <div className="flex flex-col gap-1.5 px-1">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Main LeftModule ──────────────────────────────────────────────────────────
const LeftModule = () => {
  const dispatch = useDispatch();
  const clickedNodeId = useSelector((state) => state.flow.clickedNodeId);
  const addedNodeIds = useSelector((state) => state.flow.addedNodeIds);

  const [nodes, setNodes] = useState([]);
  const [query, setQuery] = useState('');

  // Fetch node registry from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/pre-fun`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        const newNodes = Object.entries(result)
          .filter(([, name]) => name !== '__start__' && name !== '__end__')
          .map(([id, name]) => ({ id: String(id), data: { label: name } }));
        console.log("new codes", newNodes);
        setNodes(newNodes);
      } catch (err) {
        console.error('error fetching nodes:', err);
      }
    };
    fetchData();
  }, []);

  const handleNodeClick = (node) => {
    const isSelected = node.id === clickedNodeId;
    if (isSelected) {
      dispatch(removeNodeId(node.id));
      dispatch(clearClickedNodeId());
    } else {
      dispatch(addNodeId(node.id));
      dispatch(setClickedNodeId(node.id));
      dispatch(setSelectedNodeLabel(node.data.label));
    }
  };

  // Filter nodes by search query
  const filtered = nodes.filter(node =>
    (NODE_META[node.data.label]?.label || node.data.label)
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  // Split by category
  const aiNodes = filtered.filter(n => NODE_META[n.data.label]?.category === 'ai');
  const studentNodes = filtered.filter(n => NODE_META[n.data.label]?.category === 'student');
  const actionNodes = filtered.filter(n => NODE_META[n.data.label]?.category === 'action');

  return (
    <div className="h-full flex flex-col border-r border-gray-200 bg-gray-50">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs">⚡</div>
          <h2 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Node Library</h2>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 border border-gray-200 focus-within:border-blue-400 focus-within:bg-white transition-all duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192.904 192.904" className="w-3.5 h-3.5 fill-gray-400 flex-shrink-0">
            <path d="m190.707 180.101-47.078-47.077c11.702-14.072 18.752-32.142 18.752-51.831C162.381 36.423 125.959 0 81.191 0 36.422 0 0 36.423 0 81.193c0 44.767 36.422 81.187 81.191 81.187 19.688 0 37.759-7.049 51.831-18.751l47.079 47.078a7.474 7.474 0 0 0 5.303 2.197 7.498 7.498 0 0 0 5.303-12.803zM15 81.193C15 44.694 44.693 15 81.191 15c36.497 0 66.189 29.694 66.189 66.193 0 36.496-29.692 66.187-66.189 66.187C44.693 147.38 15 117.689 15 81.193z" />
          </svg>
          <input
            type="search"
            placeholder="Search nodes…"
            className="text-xs w-full bg-transparent outline-none text-gray-700 placeholder-gray-400"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Scrollable Node List ── */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-2 custom-scrollbar">

        {/* AI Nodes */}
        {aiNodes.length > 0 && (
          <CategorySection title="AI Nodes" emoji="🤖" count={aiNodes.length} accentClass="text-blue-600" defaultOpen>
            {aiNodes.map(node => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={node.id === clickedNodeId}
                isAdded={addedNodeIds.includes(node.id)}
                onClick={() => handleNodeClick(node)}
              />
            ))}
          </CategorySection>
        )}

        {/* Student Nodes */}
        {studentNodes.length > 0 && (
          <CategorySection title="Student Tools" emoji="🎓" count={studentNodes.length} accentClass="text-amber-600" defaultOpen>
            {studentNodes.map(node => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={node.id === clickedNodeId}
                isAdded={addedNodeIds.includes(node.id)}
                onClick={() => handleNodeClick(node)}
              />
            ))}
          </CategorySection>
        )}

        {/* Actions */}
        {actionNodes.length > 0 && (
          <CategorySection title="Actions" emoji="⚡" count={actionNodes.length} accentClass="text-rose-600" defaultOpen>
            {actionNodes.map(node => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={node.id === clickedNodeId}
                isAdded={addedNodeIds.includes(node.id)}
                onClick={() => handleNodeClick(node)}
              />
            ))}
          </CategorySection>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <span className="text-3xl">🔍</span>
            <p className="text-xs text-gray-400">No nodes match <span className="font-semibold">"{query}"</span></p>
          </div>
        )}
      </div>

      {/* ── Footer: canvas count ── */}
      <div className="px-4 py-2.5 border-t border-gray-200 bg-white">
        <p className="text-[10px] text-gray-400 text-center">
          <span className="font-semibold text-blue-500">{addedNodeIds.length}</span> node{addedNodeIds.length !== 1 ? 's' : ''} on canvas
        </p>
      </div>
    </div>
  );
};

export default LeftModule;