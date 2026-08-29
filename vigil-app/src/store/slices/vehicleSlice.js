import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Async thunks
export const fetchVehicles = createAsyncThunk(
  'vehicles/fetchVehicles',
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/fleet/vehicles', { params });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch vehicles');
    }
  }
);

export const updateVehicleStatus = createAsyncThunk(
  'vehicles/updateVehicleStatus',
  async ({ vehicleId, status }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/api/v1/fleet/vehicles/${vehicleId}`, { status });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update vehicle');
    }
  }
);

export const updateVehicleLocation = createAsyncThunk(
  'vehicles/updateVehicleLocation',
  async ({ vehicleId, lat, lng, heading, speed }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/v1/fleet/vehicles/${vehicleId}/location`, {
        lat, lng, heading, speed
      });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update location');
    }
  }
);

const initialState = {
  vehicles: [],
  selectedVehicle: null,
  loading: false,
  error: null,
  lastUpdated: null,
};

const vehicleSlice = createSlice({
  name: 'vehicles',
  initialState,
  reducers: {
    setSelectedVehicle: (state, action) => {
      state.selectedVehicle = action.payload;
    },
    clearSelectedVehicle: (state) => {
      state.selectedVehicle = null;
    },
    updateVehicleInList: (state, action) => {
      const index = state.vehicles.findIndex(v => v.id === action.payload.id);
      if (index !== -1) {
        state.vehicles[index] = { ...state.vehicles[index], ...action.payload };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch vehicles
      .addCase(fetchVehicles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchVehicles.fulfilled, (state, action) => {
        state.loading = false;
        state.vehicles = action.payload;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchVehicles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update vehicle status
      .addCase(updateVehicleStatus.fulfilled, (state, action) => {
        const index = state.vehicles.findIndex(v => v.id === action.payload.id);
        if (index !== -1) {
          state.vehicles[index] = action.payload;
        }
      })
      // Update vehicle location
      .addCase(updateVehicleLocation.fulfilled, (state, action) => {
        const index = state.vehicles.findIndex(v => v.id === action.payload.id);
        if (index !== -1) {
          state.vehicles[index] = {
            ...state.vehicles[index],
            location: action.payload.location
          };
        }
      });
  },
});

export const { setSelectedVehicle, clearSelectedVehicle, updateVehicleInList } = vehicleSlice.actions;
export default vehicleSlice.reducer;
