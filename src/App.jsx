import React, { useState, useRef, useEffect, useCallback } from 'react';
import Vapi from '@vapi-ai/web';
import './main.css';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';

const vapi = new Vapi({
  publicKey: process.env.REACT_APP_VAPI_PUBLIC_KEY,
});

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const messagesEndRef = useRef(null);
  const timeoutRef = useRef(null);
  const callRef = useRef(null);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialTranscript]);

  // Start/stop Vapi voice on icon click
  const toggleVoiceChat = useCallback(async () => {
    if (isVoiceChatActive) {
      if (callRef.current) {
        callRef.current.hangup();
        callRef.current = null;
      }
      setIsVoiceChatActive(false);
      setPartialTranscript('');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
      setIsVoiceChatActive(true);
      const call = await vapi.start({
        assistant: process.env.REACT_APP_VAPI_ASSISTANT_ID,
        voice: true,
        text: false,
      });

      if (!call) {
        setIsVoiceChatActive(false);
        setPartialTranscript('');
        alert("Could not start voice call. Please check your Vapi keys and assistant ID.");
        return;
      }

      callRef.current = call;

      call.on('transcript', (event) => {
        const { transcript, isFinal } = event.detail || event;
        if (!transcript) return;

        if (isFinal) {
          setMessages(prev => [
            ...prev,
            { sender: 'user', text: transcript }
          ]);
          setPartialTranscript('');
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          sendMessage(transcript);
        } else {
          setPartialTranscript(transcript);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            setMessages(prev => [
              ...prev,
              { sender: 'user', text: transcript }
            ]);
            setPartialTranscript('');
            sendMessage(transcript);
          }, 3000);
        }
      });

      call.on('end', () => {
        setIsVoiceChatActive(false);
        setPartialTranscript('');
        callRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      });
    }
  }, [isVoiceChatActive]);

  // Function to send a message to the AI backend
  const sendMessage = async (text) => {
    const messageText = typeof text === 'string' ? text : inputMessage;
    if (!messageText.trim()) return;

    const userMessage = { sender: 'user', text: messageText };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    if (!text) setInputMessage('');
    setIsLoading(true);

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

  // Function to handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      sendMessage();
    }
  };

  useEffect(() => {
    vapi.on('error', (err) => {
      console.error('Vapi error:', err);
      alert('Vapi error: ' + (err?.message || JSON.stringify(err)));
    });
  }, []);

  return (
    <>
      <div className="aven-bg">
        <div className="aven-container">
          {/* Header */}
          <div className="aven-header">
            <h1 className="aven-title">Aven Support Agent</h1>
            {/* Voice Chat Icon */}
            <IconButton
              onClick={toggleVoiceChat}
              color={isVoiceChatActive ? "error" : "success"}
              size="large"
              sx={{
                bgcolor: isVoiceChatActive ? 'error.main' : 'success.main',
                color: 'white',
                '&:hover': { bgcolor: isVoiceChatActive ? 'error.dark' : 'success.dark' }
              }}
            >
              {isVoiceChatActive ? <StopCircleIcon /> : <MicIcon />}
            </IconButton>
          </div>

          {/* Chat Messages */}
          <div className="aven-messages">
            {messages.length === 0 && (
              <div className="aven-welcome">
                Welcome to <span className="highlight">Aven Support</span>! How can I assist you today?
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
              onClick={sendMessage}
              disabled={isLoading || inputMessage.trim() === ''}
              sx={{ bgcolor: 'blue.600', color: 'white', '&:hover': { bgcolor: 'blue.700' } }}
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