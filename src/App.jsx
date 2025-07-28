import React, { useState, useRef, useEffect, useCallback } from 'react';
import './main.css';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import Vapi from '@vapi-ai/web';

// --- Vapi Initialization ---
// Initialize Vapi outside of the component to prevent re-initialization on re-renders.
const vapi = new Vapi(process.env.REACT_APP_VAPI_PUBLIC_KEY || '');

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');

  const messagesEndRef = useRef(null);
  // This ref will hold a direct reference to the last AI message object in the state.
  const lastAiMessageRef = useRef(null);
  // Ref to track voice chat state for use in event handlers
  const isVoiceChatActiveRef = useRef(false);

  // --- Vapi Event Listeners Effect ---
  useEffect(() => {
    // This effect runs only once to set up the listeners.
    const onCallStart = () => {
      // console.log('Call has started.');
      setIsVoiceChatActive(true);
      isVoiceChatActiveRef.current = true;
    };

    const onCallEnd = () => {
      // console.log('Call has ended.');
      setIsVoiceChatActive(false);
      isVoiceChatActiveRef.current = false;
      setPartialTranscript('');
      lastAiMessageRef.current = null; // Reset the ref on call end.
    };

    const onSpeechStart = (event) => {
      // When the AI starts talking, we create a new, empty message bubble for it.
      // Check if event exists and has role property to avoid undefined errors
      // Only create empty message bubbles for voice chat, not text chat
      if (event && event.role === 'assistant' && isVoiceChatActiveRef.current) {
        const newAiMessage = { sender: 'ai', text: '' };
        // We use a functional update to get the latest state.
        setMessages(prev => {
          // Add the new message to the state.
          const newMessages = [...prev, newAiMessage];
          // Store a reference to this new message object.
          lastAiMessageRef.current = newAiMessage;
          return newMessages;
        });
      }
    };

    const onSpeechEnd = () => {
       // When the AI stops talking, we release our reference to the message.
       // Only reset for voice chat to avoid interfering with text responses
       if (isVoiceChatActiveRef.current) {
         lastAiMessageRef.current = null;
       }
    };

    const onMessage = (message) => {
      // console.log('Message received:', message);
      
      if (message.type === 'transcript') {
        // Handle transcripts - both user and assistant
        if (message.role === 'user') {
          // Handle the user's speech transcription
          if (message.transcriptType === 'partial') {
            setPartialTranscript(message.transcript);
          } else if (message.transcriptType === 'final') {
            setPartialTranscript('');
            if (message.transcript.trim()) {
              const userMessage = { sender: 'user', text: message.transcript };
              setMessages(prev => [...prev, userMessage]);
            }
          }
        } else if (message.role === 'assistant' && message.transcriptType === 'final') {
          // Handle AI speech transcript - only use this for voice responses
          if (lastAiMessageRef.current && isVoiceChatActiveRef.current) {
            setMessages(prev =>
              prev.map(msg =>
                msg === lastAiMessageRef.current
                  ? { ...msg, text: message.transcript }
                  : msg
              )
            );
          } else if (isVoiceChatActiveRef.current) {
            // Create new AI message for voice response
            const aiMessage = { sender: 'ai', text: message.transcript };
            setMessages(prev => [...prev, aiMessage]);
          }
        }
      } else if (message.type === 'model-output') {
        // Handle streaming AI responses (for text-based chat only)
        if (!isVoiceChatActiveRef.current) {
          if (!lastAiMessageRef.current) {
            // Create a new AI message if one doesn't exist
            const newAiMessage = { sender: 'ai', text: message.output || '' };
            setMessages(prev => {
              const newMessages = [...prev, newAiMessage];
              lastAiMessageRef.current = newAiMessage;
              return newMessages;
            });
          } else {
            // Append to existing AI message
            setMessages(prev =>
              prev.map(msg =>
                msg === lastAiMessageRef.current
                  ? { ...msg, text: msg.text + (message.output || '') }
                  : msg
              )
            );
          }
        }
      } else if (message.type === 'voice-input') {
        // Reset AI message reference when voice input is complete
        if (!isVoiceChatActiveRef.current) {
          lastAiMessageRef.current = null;
        }
      }
      // Ignore conversation-update and assistant-message to prevent duplicates
    };

    const onError = (error) => {
      // console.error('Vapi error:', error);
      setIsVoiceChatActive(false);
      setMessages((prev) => [...prev, {
        sender: 'ai',
        text: 'Voice chat encountered an error. Please try again.'
      }]);
    };

    // Register all event listeners.
    vapi.on('call-start', onCallStart);
    vapi.on('call-end', onCallEnd);
    vapi.on('speech-start', onSpeechStart);
    vapi.on('speech-end', onSpeechEnd);
    vapi.on('message', onMessage);
    vapi.on('error', onError);

    // Cleanup function to remove listeners.
    return () => {
      vapi.off('call-start', onCallStart);
      vapi.off('call-end', onCallEnd);
      vapi.off('speech-start', onSpeechStart);
      vapi.off('speech-end', onSpeechEnd);
      vapi.off('message', onMessage);
      vapi.off('error', onError);
    };
  }, []); // Empty dependency array ensures this runs only once.


  // Scroll to bottom whenever messages or partial transcripts update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialTranscript]);

  // --- Text-based Chat Function (Updated to use Vapi) ---
  const sendTextMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMessage = { sender: 'user', text: inputMessage };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const messageText = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    try {
      // Check if we're in an active call, if not start one for text-based chat
      const assistantId = process.env.REACT_APP_VAPI_ASSISTANT_ID;
      if (!assistantId) {
        throw new Error('Assistant ID not configured');
      }

      // If not in a call, start one first
      if (!isVoiceChatActive) {
        await vapi.start(assistantId);
        // Wait a moment for the call to establish
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Send message to Vapi
      try {
        await vapi.send({
          type: 'add-message',
          message: {
            role: 'user',
            content: messageText
          }
        });
        // console.log('Text message sent to Vapi successfully');
      } catch (sendError) {
        // console.error('Error sending message to Vapi:', sendError);
        throw sendError;
      }
      
    } catch (error) {
      // console.error('Error with Vapi text chat:', error);
      
      // Fallback to original backend if Vapi fails
      try {
        const response = await fetch(process.env.REACT_APP_BACKEND_URL + '/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userMessage.text }),
        });
        
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        const aiMessage = { sender: 'ai', text: data.answer || "Sorry, I couldn't find an answer." };
        setMessages((prevMessages) => [...prevMessages, aiMessage]);
      } catch (fallbackError) {
        // console.error('Fallback backend also failed:', fallbackError);
        setMessages(prev => [
          ...prev,
          { sender: 'ai', text: 'Could not connect to support server.' }
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      sendTextMessage();
    }
  };

  // --- Voice Chat Control Functions (No Changes) ---
  const startVoiceChat = useCallback(async () => {
    const assistantId = process.env.REACT_APP_VAPI_ASSISTANT_ID;
    if (!assistantId) {
      // console.error('REACT_APP_VAPI_ASSISTANT_ID is not set');
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      vapi.start(assistantId);
    } catch (error) {
      // console.error('Microphone permission denied:', error);
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: 'Microphone access is required. Please allow microphone permissions.'
      }]);
    }
  }, []);

  const stopVoiceChat = useCallback(() => {
    vapi.stop();
  }, []);

  const toggleVoiceChat = useCallback(() => {
    if (isVoiceChatActive) {
      stopVoiceChat();
    } else {
      startVoiceChat();
    }
  }, [isVoiceChatActive, startVoiceChat, stopVoiceChat]);

  return (
    <>
      <div className="aven-bg">
        <div className="aven-container">
          <div className="aven-header">
            <h1 className="aven-title">Aven Support Agent</h1>
          </div>
          <div className="aven-messages">
            {messages.length === 0 && (
              <div className="aven-welcome">
                Welcome to <span className="highlight">Aven Support</span>! Click the mic to talk or type a message below.
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`aven-message-row ${msg.sender === 'user' ? 'user' : 'ai'}`}
              >
                <div className={`aven-message ${msg.sender}`}>
                  {msg.text}
                  {/* Show a blinking cursor on the AI message currently being spoken */}
                  {msg === lastAiMessageRef.current && <span className="aven-blink-cursor">|</span>}
                </div>
              </div>
            ))}
            {partialTranscript && (
              <div className="aven-message-row user">
                <div className="aven-message user aven-transcript">
                  {partialTranscript}
                  <span className="aven-blink-cursor">|</span>
                </div>
              </div>
            )}
            {isLoading && (
              <div className="aven-loading-row">
                <div className="aven-loading-message">
                  <div className="aven-bounce-dots">
                    <span className="aven-bounce-dot"></span>
                    <span className="aven-bounce-dot delay-200"></span>
                    <span className="aven-bounce-dot delay-400"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="aven-input-area">
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Type your question..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              size="small"
              sx={{
                backgroundColor: 'white',
                borderRadius: '9999px',
                '& .MuiOutlinedInput-root': {
                  borderRadius: '9999px',
                },
              }}
            />
            <IconButton
              color="primary"
              onClick={toggleVoiceChat}
              sx={{
                bgcolor: isVoiceChatActive ? '#ef4444' : '#22c55e',
                color: 'white',
                '&:hover': {
                  bgcolor: isVoiceChatActive ? '#dc2626' : '#16a34a'
                },
                mx: 1
              }}
            >
              {isVoiceChatActive ? <StopCircleIcon /> : <MicIcon />}
            </IconButton>
            <IconButton
              color="primary"
              onClick={sendTextMessage}
              disabled={isLoading || inputMessage.trim() === ''}
              sx={{
                bgcolor: '#3b82f6',
                color: 'white',
                '&:hover': { bgcolor: '#2563eb' },
                '&:disabled': { bgcolor: '#9ca3af' }
              }}
            >
              <SendIcon />
            </IconButton>
          </div>
        </div>
      </div>
    </>
  );
};

export default App;