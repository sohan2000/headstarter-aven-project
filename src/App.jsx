import React, { useState, useRef, useEffect, useCallback } from 'react';
import './main.css';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import Vapi from '@vapi-ai/web';

const vapi = new Vapi(process.env.REACT_APP_VAPI_PUBLIC_KEY || '');

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');

  const messagesEndRef = useRef(null);
  const lastAiMessageRef = useRef(null);
  const isVoiceChatActiveRef = useRef(false);

  useEffect(() => {
    const onCallStart = () => {
      setIsVoiceChatActive(true);
      isVoiceChatActiveRef.current = true;
    };

    const onCallEnd = () => {
      setIsVoiceChatActive(false);
      isVoiceChatActiveRef.current = false;
      setPartialTranscript('');
      lastAiMessageRef.current = null;
    };

    const onSpeechStart = (event) => {
      if (event && event.role === 'assistant' && isVoiceChatActiveRef.current) {
        const newAiMessage = { sender: 'ai', text: '' };
        setMessages(prev => {
          const newMessages = [...prev, newAiMessage];
          lastAiMessageRef.current = newAiMessage;
          return newMessages;
        });
      }
    };

    const onSpeechEnd = () => {
       if (isVoiceChatActiveRef.current) {
         lastAiMessageRef.current = null;
       }
    };

    const onMessage = (message) => {
      if (message.type === 'transcript') {
        if (message.role === 'user') {
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
          if (lastAiMessageRef.current && isVoiceChatActiveRef.current) {
            setMessages(prev =>
              prev.map(msg =>
                msg === lastAiMessageRef.current
                  ? { ...msg, text: message.transcript }
                  : msg
              )
            );
          } else if (isVoiceChatActiveRef.current) {
            const aiMessage = { sender: 'ai', text: message.transcript };
            setMessages(prev => [...prev, aiMessage]);
          }
        }
      } else if (message.type === 'model-output') {
        if (!isVoiceChatActiveRef.current) {
          if (!lastAiMessageRef.current) {
            const newAiMessage = { sender: 'ai', text: message.output || '' };
            setMessages(prev => {
              const newMessages = [...prev, newAiMessage];
              lastAiMessageRef.current = newAiMessage;
              return newMessages;
            });
          } else {
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
        if (!isVoiceChatActiveRef.current) {
          lastAiMessageRef.current = null;
        }
      }
    };

    const onError = (error) => {
      setIsVoiceChatActive(false);
      setMessages((prev) => [...prev, {
        sender: 'ai',
        text: 'Voice chat encountered an error. Please try again.'
      }]);
    };

    vapi.on('call-start', onCallStart);
    vapi.on('call-end', onCallEnd);
    vapi.on('speech-start', onSpeechStart);
    vapi.on('speech-end', onSpeechEnd);
    vapi.on('message', onMessage);
    vapi.on('error', onError);

    return () => {
      vapi.off('call-start', onCallStart);
      vapi.off('call-end', onCallEnd);
      vapi.off('speech-start', onSpeechStart);
      vapi.off('speech-end', onSpeechEnd);
      vapi.off('message', onMessage);
      vapi.off('error', onError);
    };
  }, []);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialTranscript]);

  const sendTextMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMessage = { sender: 'user', text: inputMessage };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const messageText = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    try {
      const assistantId = process.env.REACT_APP_VAPI_ASSISTANT_ID;
      if (!assistantId) {
        throw new Error('Assistant ID not configured');
      }

      if (!isVoiceChatActive) {
        await vapi.start(assistantId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      try {
        await vapi.send({
          type: 'add-message',
          message: {
            role: 'user',
            content: messageText
          }
        });
      } catch (sendError) {
        throw sendError;
      }
      
    } catch (error) {
      try {
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://headstarter-aven-project.vercel.app/api';
        const response = await fetch(`${backendUrl}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userMessage.text }),
        });
        
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        const aiMessage = { sender: 'ai', text: data.answer || "Sorry, I couldn't find an answer." };
        setMessages((prevMessages) => [...prevMessages, aiMessage]);
      } catch (fallbackError) {
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

  const startVoiceChat = useCallback(async () => {
    const assistantId = process.env.REACT_APP_VAPI_ASSISTANT_ID;
    if (!assistantId) {
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      vapi.start(assistantId);
    } catch (error) {
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
    <div className="aven-bg">
      <div className="aven-container">
        <div className="aven-navbar">
          <a href="https://www.aven.com" className="aven-logo-link">
            <svg className="aven-logo" viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="10" y="25" fontSize="18" fontWeight="700" fill="#000000">Aven</text>
            </svg>
          </a>
        </div>
        
        <div className="aven-header">
          <h1 className="aven-title">How can we help?</h1>
          <p className="aven-subtitle">Get instant support for your Aven Card</p>
        </div>
    
        <div className="aven-messages">
          {messages.length === 0 && (
            <div className="aven-welcome">
              <h2>Welcome to Aven Support</h2>
              <p>
                Ask questions about your <span className="highlight">Aven Card</span>, 
                rates, payments, applications, and more. You can also use voice chat for hands-free assistance.
              </p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`aven-message-row ${msg.sender === 'user' ? 'user' : 'ai'}`}
            >
              <div className={`aven-message ${msg.sender}`}>
                {msg.text}
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

        <div className="aven-search-section">
          <div className="aven-search-container">
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search question, keywords, or topics"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              size="medium"
              sx={{
                backgroundColor: 'transparent',
                borderRadius: 'var(--aven-radius)',
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 'var(--aven-radius)',
                  fontSize: '1rem',
                  backgroundColor: 'transparent',
                  '& fieldset': {
                    border: 'none',
                  },
                  '&:hover fieldset': {
                    border: 'none',
                  },
                  '&.Mui-focused fieldset': {
                    border: 'none',
                  },
                },
                '& .MuiInputBase-input': {
                  padding: '16px 20px',
                  color: 'var(--aven-text-primary)',
                  '&::placeholder': {
                    color: 'var(--aven-text-muted)',
                    opacity: 1,
                  },
                },
              }}
            />
            <button
              className={`aven-action-button ${isVoiceChatActive ? '' : 'primary'}`}
              onClick={toggleVoiceChat}
            >
              {isVoiceChatActive ? <StopCircleIcon /> : <MicIcon />}
            </button>
            <IconButton
              color="primary"
              onClick={sendTextMessage}
              disabled={isLoading || inputMessage.trim() === ''}
              sx={{
                bgcolor: 'var(--aven-accent)',
                color: 'white',
                width: 52,
                height: 52,
                '&:hover': {
                  bgcolor: 'var(--aven-accent-light)',
                  transform: 'scale(1.05)',
                },
                '&:disabled': {
                  bgcolor: 'var(--aven-text-muted)',
                  transform: 'none',
                },
                borderRadius: 'var(--aven-radius)',
                transition: 'all 0.2s ease',
                boxShadow: 'var(--aven-shadow)',
              }}
            >
              <SendIcon sx={{ fontSize: '1.25rem' }} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;