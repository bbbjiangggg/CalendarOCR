import React, { createContext, useContext, useReducer } from 'react';

const EventContext = createContext();

const initialEventData = {
  title: '',
  date: new Date(),
  location: '',
  description: '',
  notification: '1hr',
  calendar: 'default'
};

const initialState = {
  events: [initialEventData],
  currentEventIndex: 0,
  capturedImage: null,
  isProcessing: false,
  error: null
};

const eventReducer = (state, action) => {
  switch (action.type) {
    case 'SET_IMAGE':
      return {
        ...state,
        capturedImage: action.payload,
        error: null
      };
    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.payload
      };
    case 'SET_MULTIPLE_EVENTS':
      return {
        ...state,
        events: action.payload.length > 0 ? action.payload : [initialEventData],
        currentEventIndex: 0,
        error: null
      };
    case 'SET_EVENT_DATA':
      const newEvents = [...state.events];
      newEvents[state.currentEventIndex] = {
        ...newEvents[state.currentEventIndex],
        ...action.payload
      };
      return {
        ...state,
        events: newEvents
      };
    case 'UPDATE_FIELD':
      const updatedEvents = [...state.events];
      updatedEvents[state.currentEventIndex] = {
        ...updatedEvents[state.currentEventIndex],
        [action.field]: action.value
      };
      return {
        ...state,
        events: updatedEvents
      };
    case 'SELECT_EVENT':
      return {
        ...state,
        currentEventIndex: action.payload
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isProcessing: false
      };
    case 'RESET_EVENT':
      return {
        ...initialState,
        events: [{
          ...initialEventData,
          date: new Date()
        }]
      };
    case 'CLEAR_IMAGE':
      return {
        ...state,
        capturedImage: null
      };
    default:
      return state;
  }
};

export const EventProvider = ({ children }) => {
  const [state, dispatch] = useReducer(eventReducer, initialState);

  return (
    <EventContext.Provider value={{ state, dispatch }}>
      {children}
    </EventContext.Provider>
  );
};

export const useEvent = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
};