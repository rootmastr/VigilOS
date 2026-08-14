import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Async thunks
export const fetchIncidents = createAsyncThunk(
  'incidents/fetchIncidents',
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/incidents', { params });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch incidents');
    }
  }
);

export const createIncident = createAsyncThunk(
  'incidents/createIncident',
  async (incidentData, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/incidents', incidentData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to create incident');
    }
  }
);

export const updateIncidentStatus = createAsyncThunk(
  'incidents/updateIncidentStatus',
  async ({ incidentId, status }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/api/v1/incidents/${incidentId}`, { status });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update incident');
    }
  }
);

export const exportIncidents = createAsyncThunk(
  'incidents/exportIncidents',
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/incidents/export/csv', {
        params,
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to export incidents');
    }
  }
);

const initialState = {
  incidents: [],
  selectedIncident: null,
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  },
  filters: {
    type: null,
    severity: null,
    status: null,
    dateFrom: null,
    dateTo: null,
  },
  loading: false,
  error: null,
};

const incidentSlice = createSlice({
  name: 'incidents',
  initialState,
  reducers: {
    setSelectedIncident: (state, action) => {
      state.selectedIncident = action.payload;
    },
    clearSelectedIncident: (state) => {
      state.selectedIncident = null;
    },
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },
    addIncident: (state, action) => {
      state.incidents.unshift(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch incidents
      .addCase(fetchIncidents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchIncidents.fulfilled, (state, action) => {
        state.loading = false;
        state.incidents = action.payload.incidents;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchIncidents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create incident
      .addCase(createIncident.fulfilled, (state, action) => {
        state.incidents.unshift(action.payload);
      })
      // Update incident status
      .addCase(updateIncidentStatus.fulfilled, (state, action) => {
        const index = state.incidents.findIndex(i => i.id === action.payload.id);
        if (index !== -1) {
          state.incidents[index] = action.payload;
        }
      });
  },
});

export const {
  setSelectedIncident,
  clearSelectedIncident,
  setFilters,
  clearFilters,
  addIncident
} = incidentSlice.actions;
export default incidentSlice.reducer;
