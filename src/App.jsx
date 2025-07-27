import React, { useState, useRef, useEffect, useCallback } from 'react';
import './main.css';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import Vapi from '@vapi-ai/web';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [vapi, setVapi] = useState(null);
  const messagesEndRef = useRef(null);
  const callRef = useRef(null);

  // Initialize Vapi and set up event listeners
  useEffect(() => {
    if (!process.env.REACT_APP_VAPI_PUBLIC_KEY) {
      console.error('REACT_APP_VAPI_PUBLIC_KEY is not set');
      return;
    }

    const vapiInstance = new Vapi(process.env.REACT_APP_VAPI_PUBLIC_KEY);
    setVapi(vapiInstance);

    // Function to handle all Vapi messages
    const onMessage = (message) => {
      console.log('Vapi message received:', message);

      if (message.type === 'transcript') {
        if (message.transcriptType === 'partial') {
          setPartialTranscript(message.transcript);
        } else if (message.transcriptType === 'final') {
          // Add user message to chat
          if (message.transcript && message.transcript.trim()) {
            const userMessage = { sender: 'user', text: message.transcript };
            setMessages(prev => [...prev, userMessage]);
          }
          setPartialTranscript(''); // Clear partial transcript after final
        }
      } else if (message.type === 'assistant-message') {
        // Handle assistant responses
        const content = message.message?.content || message.content;
        if (content) {
          const aiMessage = { sender: 'ai', text: content };
          setMessages(prev => [...prev, aiMessage]);
        }
      } else if (message.type === 'conversation-update') {
        // Handle conversation updates (alternative message format)
        if (message.conversation && message.conversation.length > 0) {
          const lastMessage = message.conversation[message.conversation.length - 1];
          if (lastMessage.role === 'assistant' && lastMessage.message) {
            const aiMessage = { sender: 'ai', text: lastMessage.message };
            setMessages(prev => [...prev, aiMessage]);
          }
        }
      }
    };

    const onCallStart = () => {
      console.log('Call has started.');
      setIsVoiceChatActive(true);
    };

    const onCallEnd = () => {
      console.log('Call has ended.');
      setIsVoiceChatActive(false);
      setPartialTranscript(''); // Clean up partial transcript on call end
    };

    const onError = (error) => {
      console.error('Vapi error:', error);
      setIsVoiceChatActive(false);
      setPartialTranscript('');
      setMessages((prev) => [...prev, {
        sender: 'ai',
        text: 'Voice chat encountered an error. Please try again.'
      }]);
    };

    // Register event listeners
    vapiInstance.on('call-start', onCallStart);
    vapiInstance.on('call-end', onCallEnd);
    vapiInstance.on('message', onMessage);
    vapiInstance.on('error', onError);

    // Cleanup function to remove listeners and stop any active call
    return () => {
      if (vapiInstance) {
        vapiInstance.off('call-start', onCallStart);
        vapiInstance.off('call-end', onCallEnd);
        vapiInstance.off('message', onMessage);
        vapiInstance.off('error', onError);
        
        // Stop the call if active
        if (isVoiceChatActive) {
          vapiInstance.stop();
        }
      }
    };
  }, []); // Empty dependency array - only run once


  // Scroll to bottom whenever messages or partial transcripts update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialTranscript]);

  // --- Text-based Chat Function (Kept as is) ---
  const sendTextMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = { sender: 'user', text: inputMessage };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // This fetch call is for a separate, text-based backend.
      // It is independent of the Vapi voice functionality.
      const response = await fetch(process.env.REACT_APP_BACKEND_URL + '/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage.text }),
      });

      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      const aiMessage = { sender: 'ai', text: data.answer || "Sorry, I couldn't find an answer." };
      setMessages((prevMessages) => [...prevMessages, aiMessage]);
    } catch (error) {
      console.error('Error fetching AI response:', error);
      setMessages(prev => [
        ...prev,
        { sender: 'ai', text: 'Could not connect to support server. Please check your network or contact admin.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      sendTextMessage();
    }
  };

  // --- Voice Chat Control Functions ---
  const startVoiceChat = useCallback(async () => {
    if (!vapi) {
      console.error('Vapi not initialized');
      return;
    }

    // Check for Assistant ID
    const assistantId = process.env.REACT_APP_VAPI_ASSISTANT_ID;
    if (!assistantId) {
      console.error('REACT_APP_VAPI_ASSISTANT_ID is not set');
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: 'Voice assistant is not configured. Please contact support.'
      }]);
      return;
    }

    // Check for microphone permissions
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: 'Microphone access is required for voice chat. Please allow microphone permissions and try again.'
      }]);
      return;
    }

    try {
      console.log('Starting voice chat with assistant ID:', assistantId);
      
      // Use the assistant ID to start the call
      const call = await vapi.start(assistantId);
      
      callRef.current = call;
      console.log('Voice chat started successfully with assistant ID');
    } catch (error) {
      console.error('Error starting voice chat:', error);
      setIsVoiceChatActive(false);
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: 'Sorry, there was an issue starting the voice chat. Please try again.'
      }]);
    }
  }, [vapi]);

  const stopVoiceChat = useCallback(() => {
    if (vapi && isVoiceChatActive) {
      console.log('Stopping voice chat...');
      vapi.stop();
      setIsVoiceChatActive(false);
      setPartialTranscript('');
      callRef.current = null;
    }
  }, [vapi, isVoiceChatActive]);

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
          {/* Header */}
          <div className="aven-header">
            <h1 className="aven-title">Aven Support Agent</h1>
          </div>

          {/* Chat Messages */}
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
                </div>
              </div>
            ))}
            {/* Show partial transcript as a "typing" user message */}
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

          {/* Input Area */}
          <div className="aven-input-area">
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Type your question..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading || isVoiceChatActive}
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
                bgcolor: isVoiceChatActive ? '#ef4444' : '#22c55e', // red-500, green-500
                color: 'white',
                '&:hover': {
                  bgcolor: isVoiceChatActive ? '#dc2626' : '#16a34a' // red-600, green-600
                },
                mx: 1
              }}
            >
              {isVoiceChatActive ? <StopCircleIcon /> : <MicIcon />}
            </IconButton>
            <IconButton
              color="primary"
              onClick={sendTextMessage}
              disabled={isLoading || isVoiceChatActive || inputMessage.trim() === ''}
              sx={{
                bgcolor: '#3b82f6', // blue-500
                color: 'white',
                '&:hover': { bgcolor: '#2563eb' }, // blue-600
                '&:disabled': { bgcolor: '#9ca3af' } // gray-400
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
