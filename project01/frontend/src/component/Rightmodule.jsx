import React, { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { clearClickedNodeId, updateInput } from '../store/flowSlice';
import { toast, ToastContainer } from 'react-toastify';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Shared PDF extractor hook
const usePDFExtractor = (reduxKey, dispatch) => {
  const [fileName, setFileName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const extractPDF = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') { toast.error('Please upload a valid PDF file.'); return; }
    setExtracting(true);
    setFileName(file.name);
    dispatch(updateInput({ key: reduxKey, value: '' }));
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
      }
      dispatch(updateInput({ key: reduxKey, value: fullText.trim() }));
      toast.success(`Extracted ${pdf.numPages} page(s) from "${file.name}"`);
    } catch { toast.error('Failed to read PDF. Try another file.'); }
    finally { setExtracting(false); }
  }, [dispatch, reduxKey]);

  return { fileName, extracting, dragOver, setDragOver, extractPDF };
};

// Set PDF.js worker source locally via Vite asset URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ─── Reusable sub-components ───────────────────────────────────────────────

const PanelHeader = ({ icon, title, subtitle, onClear }) => (
  <div className="flex items-start justify-between mb-5">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white text-lg shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 text-sm leading-tight">{title}</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
    <button
      onClick={onClear}
      className="text-gray-300 hover:text-gray-500 transition-colors text-lg leading-none mt-0.5"
      title="Deselect node"
    >×</button>
  </div>
);

const RunButton = ({ onClick, loading, label = 'Run Query' }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2
      ${loading
        ? 'bg-blue-300 text-white cursor-not-allowed'
        : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white shadow-sm'
      }`}
  >
    {loading ? (
      <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
    ) : label}
  </button>
);

// ─── Email Suggest Panel ────────────────────────────────────────────────────

const EmailSuggestPanel = ({ onClear, intMap }) => {
  const dispatch = useDispatch();
  const inputs = useSelector((state) => state.flow.inputs);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRun = async () => {
    if (!inputs.jd.trim()) { toast.warning('Please paste a Job Description first.'); return; }
    if (!intMap || intMap.length < 2) { toast.warning('Please connect nodes on the canvas first to define the flow.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: { 
            query: inputs.jd, 
            Resume: inputs.resumeText,
            email: inputs.email 
          }, 
          int_map: intMap 
        }),
      });
      const data = await res.json();
      setResult(data);
      toast.success('Email suggestion generated!');
    } catch {
      toast.error('Failed to connect to backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader icon="🧠" title="Email Suggest" subtitle="Paste a JD to generate a referral email" onClear={onClear} />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Job Description
        </label>
        <textarea
          value={inputs.jd}
          onChange={e => dispatch(updateInput({ key: 'jd', value: e.target.value }))}
          rows={8}
          placeholder="Paste the Job Description here…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition placeholder-gray-300 bg-gray-50"
        />
      </div>
      <RunButton onClick={handleRun} loading={loading} />
      {result && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          {result.subject && (
            <div>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Subject</p>
              <p className="text-sm text-gray-800 font-medium mt-0.5">{result.subject}</p>
            </div>
          )}
          {result.body && (
            <div>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Body</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5 leading-relaxed">{result.body}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Resume Reviewer Panel ─────────────────────────────────────────────────

const ResumeReviewerPanel = ({ onClear, intMap }) => {
  const dispatch = useDispatch();
  const inputs = useSelector((state) => state.flow.inputs);
  const [fileName, setFileName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const extractPDF = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file.');
      return;
    }
    setExtracting(true);
    setFileName(file.name);
    dispatch(updateInput({ key: 'resumeText', value: '' }));
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
      }
      dispatch(updateInput({ key: 'resumeText', value: fullText.trim() }));
      toast.success(`Extracted ${pdf.numPages} page(s) from "${file.name}"`);
    } catch {
      toast.error('Failed to read PDF. Try another file.');
    } finally {
      setExtracting(false);
    }
  }, [dispatch]);

  const onFileChange = e => { if (e.target.files[0]) extractPDF(e.target.files[0]); };
  const onDrop = e => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files[0]) extractPDF(e.dataTransfer.files[0]);
  };

  const handleRun = async () => {
    if (!inputs.resumeText.trim()) { toast.warning('Please upload your resume PDF first.'); return; }
    if (!intMap || intMap.length < 2) { toast.warning('Please connect nodes on the canvas first to define the flow.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          state: { 
            query: inputs.jd, 
            Resume: inputs.resumeText,
            email: inputs.email 
          }, 
          int_map: intMap 
        }),
      });
      const data = await res.json();
      setResult(data);
      toast.success('Resume reviewed!');
    } catch {
      toast.error('Failed to connect to backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader icon="📄" title="Resume Reviewer" subtitle="Upload your resume PDF for AI feedback" onClear={onClear} />

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-xl px-4 py-6 text-center transition-all duration-200 cursor-pointer
          ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'}`}
        onClick={() => document.getElementById('resume-upload').click()}
      >
        <input id="resume-upload" type="file" accept=".pdf" className="hidden" onChange={onFileChange} />
        {extracting ? (
          <div className="flex flex-col items-center gap-2">
            <span className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-blue-500 font-medium">Extracting text…</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-2xl">✅</span>
            <p className="text-xs font-semibold text-gray-700">{fileName}</p>
            <p className="text-[10px] text-gray-400">{inputs.resumeText.split(' ').length} words extracted — click to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-3xl">📋</span>
            <p className="text-xs font-medium text-gray-500">Drop your PDF here or <span className="text-blue-500 font-semibold">browse</span></p>
            <p className="text-[10px] text-gray-400">Only PDF files are supported</p>
          </div>
        )}
      </div>

      {inputs.resumeText && (
        <details className="text-xs text-gray-500 cursor-pointer">
          <summary className="font-semibold text-gray-400 select-none">Preview extracted text</summary>
          <pre className="mt-2 bg-gray-100 rounded-lg p-2.5 text-[11px] leading-relaxed overflow-auto max-h-32 whitespace-pre-wrap">{inputs.resumeText.slice(0, 600)}…</pre>
        </details>
      )}

      <RunButton onClick={handleRun} loading={loading} label="Analyse Resume" />

      {result?.Ai_Response && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">AI Feedback</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.Ai_Response}</p>
        </div>
      )}
    </div>
  );
};

// ─── Cover Letter Panel ────────────────────────────────────────────────────

const CoverLetterPanel = ({ onClear, intMap }) => {
  const dispatch = useDispatch();
  const inputs = useSelector((state) => state.flow.inputs);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRun = async () => {
    if (!inputs.jd.trim()) { toast.warning('Please paste a Job Description first.'); return; }
    if (!intMap || intMap.length < 2) { toast.warning('Please connect nodes on the canvas first to define the flow.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          state: { 
            query: inputs.jd, 
            Resume: inputs.resumeText,
            email: inputs.email 
          }, 
          int_map: intMap 
        }),
      });
      const data = await res.json();
      setResult(data);
      toast.success('Cover letter generated!');
    } catch {
      toast.error('Failed to connect to backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader icon="✍️" title="Cover Letter" subtitle="Paste a JD to generate a tailored cover letter" onClear={onClear} />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Job Description
        </label>
        <textarea
          value={inputs.jd}
          onChange={e => dispatch(updateInput({ key: 'jd', value: e.target.value }))}
          rows={8}
          placeholder="Paste the Job Description here…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition placeholder-gray-300 bg-gray-50"
        />
      </div>
      <RunButton onClick={handleRun} loading={loading} label="Generate Cover Letter" />
      {result?.Ai_Response && (
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">Cover Letter</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.Ai_Response}</p>
        </div>
      )}
    </div>
  );
};

// ─── Important Questions Panel ──────────────────────────────────────────────

const ImportantQuestionsPanel = ({ onClear, intMap }) => {
  const dispatch = useDispatch();
  const inputs = useSelector((state) => state.flow.inputs);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const { fileName, extracting, dragOver, setDragOver, extractPDF } = usePDFExtractor('bookText', dispatch);

  const onDrop = e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) extractPDF(e.dataTransfer.files[0]); };

  const handleRun = async () => {
    const content = inputs.bookText || inputs.jd;
    if (!content?.trim()) { toast.warning('Please upload a PDF book or paste some text first.'); return; }
    if (!intMap || intMap.length < 2) { toast.warning('Connect nodes on the canvas first.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { query: inputs.jd || 'generate questions', book_text: inputs.bookText, email: inputs.email }, int_map: intMap }),
      });
      const data = await res.json();
      setResult(data);
      toast.success('Important questions generated!');
    } catch { toast.error('Failed to connect to backend.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader icon="❓" title="Important Q Suggester" subtitle="Upload a PDF book to extract key questions" onClear={onClear} />

      {/* PDF Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-xl px-4 py-5 text-center transition-all duration-200 cursor-pointer
          ${dragOver ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-gray-50 hover:border-amber-400 hover:bg-amber-50/40'}`}
        onClick={() => document.getElementById('book-upload').click()}
      >
        <input id="book-upload" type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) extractPDF(e.target.files[0]); }} />
        {extracting ? (
          <div className="flex flex-col items-center gap-2">
            <span className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-amber-500 font-medium">Extracting text…</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl">✅</span>
            <p className="text-xs font-semibold text-gray-700">{fileName}</p>
            <p className="text-[10px] text-gray-400">{(inputs.bookText || '').split(' ').length} words — click to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-3xl">📚</span>
            <p className="text-xs font-medium text-gray-500">Drop your PDF book here or <span className="text-amber-500 font-semibold">browse</span></p>
            <p className="text-[10px] text-gray-400">Only PDF files are supported</p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Or paste topic / text</label>
        <textarea
          value={inputs.jd}
          onChange={e => dispatch(updateInput({ key: 'jd', value: e.target.value }))}
          rows={3}
          placeholder="Paste chapter text or topic name…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition placeholder-gray-300 bg-gray-50"
        />
      </div>

      <RunButton onClick={handleRun} loading={loading} label="Generate Questions" />

      {result?.Ai_Response && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-2">Important Questions</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.Ai_Response}</p>
        </div>
      )}
    </div>
  );
};

// ─── MCQ Generator Panel ─────────────────────────────────────────────────────

const MCQGeneratorPanel = ({ onClear, intMap }) => {
  const dispatch = useDispatch();
  const inputs = useSelector((state) => state.flow.inputs);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const { fileName, extracting, dragOver, setDragOver, extractPDF } = usePDFExtractor('bookText', dispatch);

  const onDrop = e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) extractPDF(e.dataTransfer.files[0]); };

  const handleRun = async () => {
    const content = inputs.bookText || inputs.jd;
    if (!content?.trim()) { toast.warning('Please enter a topic or upload a PDF first.'); return; }
    if (!intMap || intMap.length < 2) { toast.warning('Connect nodes on the canvas first.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { query: inputs.jd || 'generate mcqs', book_text: inputs.bookText, email: inputs.email }, int_map: intMap }),
      });
      const data = await res.json();
      setResult(data);
      toast.success('MCQs generated!');
    } catch { toast.error('Failed to connect to backend.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader icon="📝" title="MCQ Generator" subtitle="Generate multiple choice questions from material" onClear={onClear} />

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-xl px-4 py-5 text-center transition-all duration-200 cursor-pointer
          ${dragOver ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-green-400 hover:bg-green-50/40'}`}
        onClick={() => document.getElementById('mcq-book-upload').click()}
      >
        <input id="mcq-book-upload" type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) extractPDF(e.target.files[0]); }} />
        {extracting ? (
          <div className="flex flex-col items-center gap-2">
            <span className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-green-500 font-medium">Extracting text…</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl">✅</span>
            <p className="text-xs font-semibold text-gray-700">{fileName}</p>
            <p className="text-[10px] text-gray-400">{(inputs.bookText || '').split(' ').length} words — click to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-3xl">📖</span>
            <p className="text-xs font-medium text-gray-500">Drop PDF or <span className="text-green-500 font-semibold">browse</span></p>
            <p className="text-[10px] text-gray-400">Optional — you can also type topic below</p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Topic / Chapter</label>
        <textarea
          value={inputs.jd}
          onChange={e => dispatch(updateInput({ key: 'jd', value: e.target.value }))}
          rows={3}
          placeholder="e.g. Newton's Laws of Motion, Chapter 3…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition placeholder-gray-300 bg-gray-50"
        />
      </div>

      <RunButton onClick={handleRun} loading={loading} label="Generate MCQs" />

      {result?.Ai_Response && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-2">MCQs</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono text-[11px]">{result.Ai_Response}</p>
        </div>
      )}
    </div>
  );
};

// ─── Study Planner Panel ─────────────────────────────────────────────────────

const StudyPlannerPanel = ({ onClear, intMap }) => {
  const dispatch = useDispatch();
  const inputs = useSelector((state) => state.flow.inputs);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRun = async () => {
    if (!inputs.jd.trim()) { toast.warning('Please describe the topic or syllabus first.'); return; }
    if (!intMap || intMap.length < 2) { toast.warning('Connect nodes on the canvas first.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { query: inputs.jd, email: inputs.email }, int_map: intMap }),
      });
      const data = await res.json();
      setResult(data);
      toast.success('Study plan created!');
    } catch { toast.error('Failed to connect to backend.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader icon="📅" title="Study Planner" subtitle="Get a personalised study schedule for any topic" onClear={onClear} />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Topic / Syllabus</label>
        <textarea
          value={inputs.jd}
          onChange={e => dispatch(updateInput({ key: 'jd', value: e.target.value }))}
          rows={6}
          placeholder="e.g. Complete DSA in 30 days, Exam: Data Structures — Arrays, Trees, Graphs, DP…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition placeholder-gray-300 bg-gray-50"
        />
      </div>
      <RunButton onClick={handleRun} loading={loading} label="Create Study Plan" />
      {result?.Ai_Response && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-2">Your Study Plan</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.Ai_Response}</p>
        </div>
      )}
    </div>
  );
};

// ─── Mail To User Panel ─────────────────────────────────────────────────────

const MailToUserPanel = ({ onClear, intMap }) => {
  const dispatch = useDispatch();
  const inputs = useSelector((state) => state.flow.inputs);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!inputs.email.trim()) { toast.warning('Please enter a recipient email.'); return; }
    if (!intMap || intMap.length < 2) { toast.warning('Please connect nodes on the canvas first to define the flow.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          state: { 
            query: inputs.jd, 
            Resume: inputs.resumeText,
            email: inputs.email 
          }, 
          int_map: intMap 
        }),
      });
      if (res.ok) toast.success('Email sent successfully!');
      else toast.error('Failed to send email.');
    } catch {
      toast.error('Failed to connect to backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader icon="📧" title="Mail to User" subtitle="Send the generated email to a recipient" onClear={onClear} />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Recipient Email
        </label>
        <input
          type="email"
          value={inputs.email}
          onChange={e => dispatch(updateInput({ key: 'email', value: e.target.value }))}
          placeholder="recipient@example.com"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition placeholder-gray-300 bg-gray-50"
        />
      </div>
      <RunButton onClick={handleRun} loading={loading} label="Send Email" />
    </div>
  );
};

// ─── Empty / Placeholder State ──────────────────────────────────────────────

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4 py-8">
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-3xl shadow-inner">
      🔗
    </div>
    <div>
      <h3 className="font-semibold text-gray-700 text-sm">No node selected</h3>
      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
        Click a node in the left panel<br />to configure it here.
      </p>
    </div>

    {/* AI Nodes */}
    <div className="w-full text-left">
      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5 px-1">🤖 AI Nodes</p>
      <div className="flex flex-col gap-1.5">
        {[
          { icon: '🧠', label: 'Email Suggester',       desc: 'JD → referral email' },
          { icon: '📄', label: 'Resume Reviewer',        desc: 'PDF → AI feedback' },
          { icon: '✍️', label: 'Cover Letter Writer',    desc: 'JD → cover letter' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
            <span className="text-base">{item.icon}</span>
            <div className="text-left">
              <p className="text-xs font-semibold text-gray-700">{item.label}</p>
              <p className="text-[10px] text-gray-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Student Tools */}
    <div className="w-full text-left">
      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5 px-1">🎓 Student Tools</p>
      <div className="flex flex-col gap-1.5">
        {[
          { icon: '❓', label: 'Important Q Suggester', desc: 'PDF book → key questions' },
          { icon: '📝', label: 'MCQ Generator',         desc: 'Topic / PDF → MCQs' },
          { icon: '📅', label: 'Study Planner',         desc: 'Syllabus → study schedule' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
            <span className="text-base">{item.icon}</span>
            <div className="text-left">
              <p className="text-xs font-semibold text-gray-700">{item.label}</p>
              <p className="text-[10px] text-gray-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Actions */}
    <div className="w-full text-left">
      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1.5 px-1">⚡ Actions</p>
      <div className="flex flex-col gap-1.5">
        {[
          { icon: '📧', label: 'Email Send', desc: 'Send the generated email' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100">
            <span className="text-base">{item.icon}</span>
            <div className="text-left">
              <p className="text-xs font-semibold text-gray-700">{item.label}</p>
              <p className="text-[10px] text-gray-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Main Rightmodule ──────────────────────────────────────────────────────

const Rightmodule = () => {
  const dispatch = useDispatch();
  const selectedNodeLabel = useSelector((state) => state.flow.selectedNodeLabel);
  const intMap = useSelector((state) => state.flow.intMap);  // ← dynamic from canvas edges

  const handleClear = () => dispatch(clearClickedNodeId());

  const renderPanel = () => {
    switch (selectedNodeLabel) {
      case 'Email_Suggest':         return <EmailSuggestPanel onClear={handleClear} intMap={intMap} />;
      case 'Resume_Reviewer':       return <ResumeReviewerPanel onClear={handleClear} intMap={intMap} />;
      case 'Cover_Letter':          return <CoverLetterPanel onClear={handleClear} intMap={intMap} />;
      case 'mail_to_user':          return <MailToUserPanel onClear={handleClear} intMap={intMap} />;
      case 'Important_Questions':   return <ImportantQuestionsPanel onClear={handleClear} intMap={intMap} />;
      case 'MCQ_Generator':         return <MCQGeneratorPanel onClear={handleClear} intMap={intMap} />;
      case 'Study_Planner':         return <StudyPlannerPanel onClear={handleClear} intMap={intMap} />;
      default:                      return <EmptyState />;
    }
  };

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col border-l border-gray-100 bg-white" style={{ width: '28%', minWidth: 240 }}>
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${selectedNodeLabel ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              {selectedNodeLabel ? selectedNodeLabel.replaceAll('_', ' ') : 'Node Config'}
            </h2>
          </div>
          {/* Live int_map flow indicator */}
          {intMap && intMap.length > 0 && (
            <div className="flex items-center gap-1" title={`Flow: [${intMap.join(' → ')}]`}>
              <span className="text-[9px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded-md">
                [{intMap.join('→')}]
              </span>
            </div>
          )}
        </div>
        {/* Warning banner when no edges yet */}
        {(!intMap || intMap.length < 2) && selectedNodeLabel && (
          <p className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
            <span>⚠️</span> Connect nodes on the canvas to define the flow order.
          </p>
        )}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        {renderPanel()}
      </div>

      <ToastContainer position="bottom-right" autoClose={3000} hideProgressBar newestOnTop />
    </div>
  );
};

export default Rightmodule;