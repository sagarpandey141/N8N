import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  clickedNodeId: null,
  selectedNodeLabel: null,
  addedNodeIds: ['3', '4'],
  intMap: [],  // Derived from canvas edges — execution order of node IDs
  inputs: {
    jd: '',
    resumeText: '',
    email: '',
    bookText: '',
  },
  userEmail: null, // The currently logged-in user email
};

const flowSlice = createSlice({
  name: 'flow',
  initialState,
  reducers: {
    setClickedNodeId: (state, action) => {
      state.clickedNodeId = action.payload;
    },
    setSelectedNodeLabel: (state, action) => {
      state.selectedNodeLabel = action.payload;
    },
    clearClickedNodeId: (state) => {
      state.clickedNodeId = null;
      state.selectedNodeLabel = null;
    },
    addNodeId: (state, action) => {
      const id = String(action.payload);
      if (!state.addedNodeIds.includes(id)) {
        state.addedNodeIds.push(id);
      }
    },
    removeNodeId: (state, action) => {
      const id = String(action.payload);
      state.addedNodeIds = state.addedNodeIds.filter(nodeId => nodeId !== id);
      if (state.clickedNodeId === id) {
        state.clickedNodeId = null;
        state.selectedNodeLabel = null;
      }
    },
    setAddedNodeIds: (state, action) => {
      state.addedNodeIds = action.payload;
    },
    clearCanvas: (state) => {
      state.addedNodeIds = ['3', '4'];
      state.clickedNodeId = null;
      state.selectedNodeLabel = null;
      state.intMap = [];
      state.inputs = {
        jd: '',
        resumeText: '',
        email: '',
        bookText: '',
      };
    },
    setIntMap: (state, action) => {
      state.intMap = action.payload;
    },
    updateInput: (state, action) => {
      const { key, value } = action.payload;
      state.inputs[key] = value;
    },
    setUserEmail: (state, action) => {
      state.userEmail = action.payload;
    },
    signOut: (state) => {
      state.userEmail = null;
      state.addedNodeIds = ['3', '4'];
      state.clickedNodeId = null;
      state.selectedNodeLabel = null;
      state.intMap = [];
      state.inputs = {
        jd: '',
        resumeText: '',
        email: '',
        bookText: '',
      };
    },
  },
});

export const { 
  setClickedNodeId, 
  setSelectedNodeLabel,
  clearClickedNodeId, 
  addNodeId, 
  removeNodeId, 
  setAddedNodeIds,
  clearCanvas,
  setIntMap,
  updateInput,
  setUserEmail,
  signOut,
} = flowSlice.actions;

export default flowSlice.reducer;
