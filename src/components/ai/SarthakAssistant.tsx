import React, { useState, useEffect, useRef } from 'react';
import { ChatBubbleLeftIcon as ChatIcon, XMarkIcon as CloseIcon, MicrophoneIcon, PaperAirplaneIcon as PaperPlaneIcon, SpeakerWaveIcon as SpeakerIcon, StopIcon } from '@heroicons/react/24/solid';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import { functionDeclarations, handleFunctionCall } from './functions';

// TypeScript declarations for Speech Recognition API
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

// Define the Message type
interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  language: 'en' | 'hi';
  isVoiceMessage?: boolean; // For voice messages
}

// Define the props for the component
interface SarthakAssistantProps {
  onSuggestion?: (field: string, value: string) => void;
  onSubmitAndPrint?: () => void;
  currentFormData?: any;
  user?: any;
  party?: { label: string; value: string } | null;
  sm?: { label: string; value: string } | null;
  partyOptions?: { label: string; value: string }[];
  formValues?: {
    date: string; 
    series: string;
    amount: string;
    discount: string;
    receiptNo: string;
    narration: string;
  };
}

const SarthakAssistant: React.FC<SarthakAssistantProps> = (props) => {
  const { 
    onSuggestion, 
    onSubmitAndPrint, 
    currentFormData, 
    user, 
    party, 
    sm, 
    partyOptions = [], 
    formValues = {
      date: '',
      series: '',
      amount: '',
      discount: '',
      receiptNo: '',
      narration: ''
    }
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial',
      text: 'Namaste! Main Sarthak hoon, aapka cash receipt sahayak. Aapko receipt banane mein kaise madad kar sakta hoon? Mujhe "Sarthak" keh kar jagaiye.',
      isUser: false,
      timestamp: new Date(),
      language: 'hi'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'hi'>('hi');
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWakeWordDetected, setIsWakeWordDetected] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hasShownActivationMessage, setHasShownActivationMessage] = useState(false);
  const [isReady, setIsReady] = useState(false); // New state to track readiness
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const inputRef = useRef<null | HTMLInputElement>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeWordRecognitionRef = useRef<SpeechRecognition | null>(null);
  const interruptWakeWordRecognitionRef = useRef<SpeechRecognition | null>(null);
  const lastActivationTimeRef = useRef<number>(0);

  const wakeWordProcessingTimeoutRef = useRef<any>(null);
  const lastProcessedTranscriptRef = useRef<string>('');
  const isStartingWakeWordRef = useRef<boolean>(false);
  const wasAbortedRef = useRef<boolean>(false);
  
  // Abort tracking mechanism
  const totalAbortsRef = useRef<number>(0);
  const criticalAbortCountRef = useRef<number>(0);
  const criticalAbortTimeoutRef = useRef<any>(null);
  const isCriticalAbortModeRef = useRef<boolean>(false);

  const GEMINI_API_KEY = 'AIzaSyC-VMGbtv2QYMlCJIZymVOjlGbmQEQD23E';
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  // Debug: Log when props change
  useEffect(() => {
    console.log('=== SARTHAK ASSISTANT PROPS CHANGED ===');
    console.log('formValues prop changed:', JSON.stringify(formValues, null, 2));
    console.log('party prop changed:', JSON.stringify(party, null, 2));
    console.log('sm prop changed:', JSON.stringify(sm, null, 2));
  }, [formValues, party, sm]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (wakeWordProcessingTimeoutRef.current) {
        clearTimeout(wakeWordProcessingTimeoutRef.current);
      }
      if (criticalAbortTimeoutRef.current) {
        clearTimeout(criticalAbortTimeoutRef.current);
      }
    };
  }, []);

  const getSystemPrompt = async () => {
    try {
      const response = await fetch('./sysprompt.md');
      const text = await response.text();
      return text;
    } catch (error) {
      console.error('Error fetching system prompt:', error);
      return 'You are a helpful assistant.'; // Fallback prompt
    }
  };

  // Initialize voice capabilities with dual recognition system
  const initializeVoiceCapabilities = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      // Initialize regular speech recognition
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false; // Set to false for better auto-sending
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'hi-IN';
      recognitionRef.current.maxAlternatives = 5; // Increase alternatives for better number sequence recognition
      
      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        // Get the most recent text (either final or interim)
        const currentText = transcript.trim() || interimTranscript.trim();
        
        if (currentText) {
          console.log('=== VOICE RECOGNITION DEBUG ===');
          console.log('Raw transcript:', JSON.stringify(currentText));
          console.log('Is final:', !!transcript.trim());
          console.log('=== END VOICE RECOGNITION DEBUG ===');
          console.log('currentText:', currentText);
          setInputText(currentText);
          console.log("text set ")
          setTimeout(() => {
            console.log('clicking button');
            let sendBTN = document.querySelector('button[title="Send message"]') as HTMLButtonElement;
            sendBTN.click();
          }, 3000);
          // If it's a final result, send immediately
          if (transcript.trim()) {
            const trimmedTranscript = transcript.trim();
            if (trimmedTranscript && trimmedTranscript !== lastProcessedTranscriptRef.current) {
              lastProcessedTranscriptRef.current = trimmedTranscript;
              console.log('🚀 AUTO-SENDING voice message:', trimmedTranscript);
              // Force send the message immediately
              setTimeout(() => {
                console.log(0);
                handleSendMessage(trimmedTranscript, true);
              }, 5000); // Small delay to ensure state updates
            }
          }
        }
      };
      
      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Regular recognition error:', event.error);
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        console.log('Regular recognition ended');
        setIsListening(false);
        
        // Send any pending text when recognition ends (fallback)
        setTimeout(() => {
          const pendingText = inputText.trim();
          if (pendingText && pendingText !== lastProcessedTranscriptRef.current) {
            lastProcessedTranscriptRef.current = pendingText;
            console.log('🚀 AUTO-SENDING on recognition end:', pendingText);
            handleSendMessage(pendingText, true);
          }
        }, 200); // Small delay to capture final text
        
        // Auto-restart listening for continuous voice input
        if (isOpen && isWakeWordDetected && !isPlaying) {
          setTimeout(() => {
            startListening();
          }, 500); // Delay to allow message processing
        }
      };
      
      // Initialize wake word recognition
      wakeWordRecognitionRef.current = new SpeechRecognition();
      wakeWordRecognitionRef.current.continuous = true;
      wakeWordRecognitionRef.current.interimResults = true;
      wakeWordRecognitionRef.current.lang = 'hi-IN';
      wakeWordRecognitionRef.current.maxAlternatives = 3; // Increase alternatives for better recognition
      
      const wakeWords = ['sarthak', 'sarthac', 'sartac', 'start', 'start up', 'सार्थक', 'सारथक', 'शुरू', 'शुरु', 'हेलो सार्थक', 'hello sarthak'];
      
      wakeWordRecognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        if (wakeWordProcessingTimeoutRef.current) {
          clearTimeout(wakeWordProcessingTimeoutRef.current);
        }

        let fullTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        
        console.log('=== WAKE WORD RECOGNITION DEBUG ===');
        console.log('Raw transcript:', JSON.stringify(fullTranscript));
        console.log('Raw char codes:', fullTranscript.split('').map(c => c.charCodeAt(0)));
        
        // Clean the transcript using the same aggressive cleaning
        fullTranscript = fullTranscript
          .trim()
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
          .replace(/\s+/g, ' ') // Collapse whitespace
          .replace(/[^a-zA-Z0-9\s\u0900-\u097F]/g, '') // Allow only alphanumeric, space, and Hindi characters
          .toLowerCase();
        
        console.log('Cleaned transcript:', JSON.stringify(fullTranscript));
        console.log('Cleaned char codes:', fullTranscript.split('').map(c => c.charCodeAt(0)));
        console.log('=== END WAKE WORD RECOGNITION DEBUG ===');

        console.log('Wake word recognition:', fullTranscript);

        const wakeWordDetected = wakeWords.some(word => fullTranscript.includes(word));

        if (wakeWordDetected && !isOpen) {
          // Extract command after wake word
          let commandAfterWakeWord = '';
          for (const wakeWord of wakeWords) {
            const wakeWordIndex = fullTranscript.indexOf(wakeWord);
            if (wakeWordIndex !== -1) {
              commandAfterWakeWord = fullTranscript.substring(wakeWordIndex + wakeWord.length).trim();
              break;
            }
          }
          
          wakeWordProcessingTimeoutRef.current = setTimeout(() => {
            const currentTime = Date.now();
            const timeSinceLastActivation = currentTime - lastActivationTimeRef.current;

            if (timeSinceLastActivation < 3000) {
              console.log('Wake word detected but cooldown active, ignoring');
              return;
            }

            console.log('Wake word processing after pause:', fullTranscript);
            lastActivationTimeRef.current = currentTime;

            stopWakeWordListening();
            setIsOpen(true);
            setIsWakeWordDetected(true);

            if (!hasShownActivationMessage) {
              setHasShownActivationMessage(true);
            }

            if (commandAfterWakeWord && commandAfterWakeWord.length > 3) {
              console.log('Command detected after wake word:', commandAfterWakeWord);
              setInputText(commandAfterWakeWord);
              setTimeout(() => {
                const sendBTN = document.querySelector('button[title="Send message"]') as HTMLButtonElement;
                sendBTN.click();
              }, 500);


              handleSendMessage(commandAfterWakeWord, true); // Mark as voice message
            } else {
              startListening();
            }

            speakText(currentLanguage === 'hi' ? 'हाँ, मैं आपकी कैसे मदद कर सकता हूँ?' : 'Yes, how can I help you?');
          }, 2000); // Wait for 2s of silence before processing
        }
      };

      wakeWordRecognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Wake word recognition error:', event.error);
        setIsWakeWordListening(false);
        isStartingWakeWordRef.current = false; // Clear the starting flag on error
        
        if (event.error === 'not-allowed') {
          setVoiceEnabled(false);
        } else if (event.error === 'aborted') {
          // Track abort events
          totalAbortsRef.current += 1;
          console.log(`Wake word recognition aborted. Total aborts: ${totalAbortsRef.current}`);
          
          // Check if we've exceeded 20 total aborts
          if (totalAbortsRef.current > 20 && !isCriticalAbortModeRef.current) {
            console.warn('🚨 CRITICAL: More than 20 aborts detected. Entering critical abort monitoring mode.');
            isCriticalAbortModeRef.current = true;
            criticalAbortCountRef.current = 0;
            
            // Set up 30-second timeout for critical abort monitoring
            criticalAbortTimeoutRef.current = setTimeout(() => {
              console.log('✅ Critical abort monitoring period ended without triggering reload.');
              isCriticalAbortModeRef.current = false;
              criticalAbortCountRef.current = 0;
            }, 30000); // 30 seconds
          }
          
          // If in critical mode, count additional aborts
          if (isCriticalAbortModeRef.current) {
            criticalAbortCountRef.current += 1;
            console.warn(`🚨 Critical abort #${criticalAbortCountRef.current}/5 detected within monitoring period.`);
            
            // If we get 5 aborts within 30 seconds, trigger hard reload
            if (criticalAbortCountRef.current >= 5) {
              console.error('🚨 CRITICAL: 5 aborts detected within 30 seconds. Performing hard reload!');
              
              // Clear the timeout since we're reloading
              if (criticalAbortTimeoutRef.current) {
                clearTimeout(criticalAbortTimeoutRef.current);
              }
              
              // Perform hard reload
              window.location.reload();
              return; // Exit early since we're reloading
            }
          }
          
          // Mark as aborted to prevent onend handler from restarting
          wasAbortedRef.current = true;
          console.log('Wake word recognition aborted, marked to prevent restart');
        } else {
          // Restart wake word listening on other errors with longer delay
          setTimeout(() => {
            if (voiceEnabled && !isOpen && !isWakeWordListening && !isStartingWakeWordRef.current) {
              console.log('Restarting wake word recognition after error:', event.error);
              startWakeWordListening();
            }
          }, 5000); // Reduced from 10000 to 5000ms
        }
      };
      
      // Add event handlers to track actual recognition state
      wakeWordRecognitionRef.current.addEventListener('start', () => {
        console.log('Wake word recognition actually started');
        setIsWakeWordListening(true);
        isStartingWakeWordRef.current = false; // Clear the starting flag
      });
      
      wakeWordRecognitionRef.current.onend = () => {
        console.log('Wake word recognition actually ended');
        setIsWakeWordListening(false);
        isStartingWakeWordRef.current = false; // Clear the starting flag
        
        // Check if this end was due to an abort
        if (wasAbortedRef.current) {
          console.log('Recognition ended due to abort, not restarting');
          wasAbortedRef.current = false; // Reset the flag
          return;
        }
        
        // Restart if voice is enabled and assistant is closed
        // Add additional checks to prevent restart loops
        if (voiceEnabled && !isOpen && !isListening && !isStartingWakeWordRef.current) {
          setTimeout(() => {
            // Double-check conditions before restarting
            if (voiceEnabled && !isOpen && !isListening && !isWakeWordListening && !isStartingWakeWordRef.current) {
              console.log('Restarting wake word recognition after normal end');
              startWakeWordListening();
            }
          }, 500); // Increased from 100ms to 500ms to prevent rapid restarts
        }
      };
      
      // Initialize interrupt wake word recognition for during speech
      interruptWakeWordRecognitionRef.current = new SpeechRecognition();
      interruptWakeWordRecognitionRef.current.continuous = true;
      interruptWakeWordRecognitionRef.current.interimResults = true;
      interruptWakeWordRecognitionRef.current.lang = 'hi-IN';
      interruptWakeWordRecognitionRef.current.maxAlternatives = 3;
      
      const interruptWakeWords = ['sarthak', 'sarthac', 'sartac', 'start', 'start up', 'सार्थक', 'सारथक', 'शुरू', 'शुरु', 'हेलो सार्थक', 'hello sarthak'];
      
      interruptWakeWordRecognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let fullTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        
        console.log('=== INTERRUPT WAKE WORD RECOGNITION DEBUG ===');
        console.log('Raw transcript during speech:', JSON.stringify(fullTranscript));
        
        // Clean the transcript
        fullTranscript = fullTranscript
          .trim()
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
          .replace(/\s+/g, ' ') // Collapse whitespace
          .replace(/[^a-zA-Z0-9\s\u0900-\u097F]/g, '') // Allow only alphanumeric, space, and Hindi characters
          .toLowerCase();
        
        console.log('Cleaned transcript during speech:', JSON.stringify(fullTranscript));
        console.log('=== END INTERRUPT WAKE WORD RECOGNITION DEBUG ===');

        const wakeWordDetected = interruptWakeWords.some(word => fullTranscript.includes(word));

        if (wakeWordDetected && isPlaying) {
          console.log('🚨 WAKE WORD DETECTED DURING AI SPEECH - INTERRUPTING!');
          
          // Extract command after wake word
          let commandAfterWakeWord = '';
          for (const wakeWord of interruptWakeWords) {
            const wakeWordIndex = fullTranscript.indexOf(wakeWord);
            if (wakeWordIndex !== -1) {
              commandAfterWakeWord = fullTranscript.substring(wakeWordIndex + wakeWord.length).trim();
              break;
            }
          }
          
          // Stop current speech immediately
          stopSpeech();
          
          // Stop interrupt recognition temporarily
          stopInterruptWakeWordListening();
          
          // Process the command after a brief delay
          setTimeout(() => {
            if (commandAfterWakeWord && commandAfterWakeWord.length > 3) {
              console.log('Command detected after interrupt wake word:', commandAfterWakeWord);
              setInputText(commandAfterWakeWord);
              setTimeout(() => {
                handleSendMessage(commandAfterWakeWord, true);
              }, 500);
            } else {
              // Start regular listening for new command
              startListening();
              speakText(currentLanguage === 'hi' ? 'हाँ, बताइए?' : 'Yes, tell me?');
            }
          }, 300);
        }
      };
      
      interruptWakeWordRecognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Interrupt wake word recognition error:', event.error);
        // Don't restart automatically on error during speech interruption
      };
      
      interruptWakeWordRecognitionRef.current.onend = () => {
        console.log('Interrupt wake word recognition ended');
        // Restart if still playing and voice enabled
        if (isPlaying && voiceEnabled) {
          setTimeout(() => {
            startInterruptWakeWordListening();
          }, 500);
        }
      };
      
      console.log('Voice capabilities initialized');
    } else {
      setVoiceEnabled(false);
    }
  };

  // Start voice recognition
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      recognitionRef.current.start();
      console.log('Regular listening started');
    }
  };

  // Stop voice recognition
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      console.log('Regular listening stopped');
    }
  };

  // Start wake word listening
  const startWakeWordListening = () => {
    if (!wakeWordRecognitionRef.current) {
      console.log('Wake word recognition ref not available');
      return;
    }
    
    if (isWakeWordListening) {
      console.log('Wake word listening already active, skipping start');
      return;
    }
    
    if (isListening) {
      console.log('Regular listening is active, cannot start wake word listening');
      return;
    }
    
    if (isStartingWakeWordRef.current) {
      console.log('Already in process of starting wake word listening, skipping');
      return;
    }
    
    // Clear the aborted flag when starting fresh
    wasAbortedRef.current = false;
    isStartingWakeWordRef.current = true;
    
    try {
      wakeWordRecognitionRef.current.start();
      console.log('Wake word listening start command sent');
      // Note: setIsWakeWordListening(true) will be called by onstart event handler
    } catch (error) {
      console.error('Error starting wake word recognition:', error);
      isStartingWakeWordRef.current = false;
      
      // If error is because it's already started, force stop and retry
      if (error.message && error.message.includes('already started')) {
        console.log('Recognition was already started, forcing stop and retry');
        try {
          wakeWordRecognitionRef.current.stop();
          setTimeout(() => {
            if (!isWakeWordListening && !isStartingWakeWordRef.current) {
              startWakeWordListening();
            }
          }, 1000);
        } catch (stopError) {
          console.error('Error stopping recognition for retry:', stopError);
        }
      }
    }
  };

  // Stop wake word listening
  const stopWakeWordListening = () => {
    if (!wakeWordRecognitionRef.current) {
      if (isWakeWordListening) {
        console.log('Wake word recognition ref not available, updating state only');
        setIsWakeWordListening(false);
        isStartingWakeWordRef.current = false;
      }
      return;
    }
    
    if (!isWakeWordListening && !isStartingWakeWordRef.current) {
      console.log('Wake word listening not active, skipping stop');
      return;
    }
    
    try {
      wakeWordRecognitionRef.current.stop();
      console.log('Wake word listening stop command sent');
      // Note: setIsWakeWordListening(false) will be called by onend event handler
    } catch (error) {
      console.error('Error stopping wake word recognition:', error);
      // Force state update on error
      setIsWakeWordListening(false);
      isStartingWakeWordRef.current = false;
    }
  };

  // Start interrupt wake word listening (during AI speech)
  const startInterruptWakeWordListening = () => {
    if (!interruptWakeWordRecognitionRef.current) {
      console.log('Interrupt wake word recognition ref not available');
      return;
    }
    
    if (!voiceEnabled || !isPlaying) {
      console.log('Not starting interrupt wake word listening - voice disabled or not playing');
      return;
    }
    
    try {
      interruptWakeWordRecognitionRef.current.start();
      console.log('Interrupt wake word listening started during AI speech');
    } catch (error) {
      console.error('Error starting interrupt wake word recognition:', error);
    }
  };

  // Stop interrupt wake word listening
  const stopInterruptWakeWordListening = () => {
    if (!interruptWakeWordRecognitionRef.current) {
      return;
    }
    
    try {
      interruptWakeWordRecognitionRef.current.stop();
      console.log('Interrupt wake word listening stopped');
    } catch (error) {
      console.error('Error stopping interrupt wake word recognition:', error);
    }
  };

  // Legacy functions for compatibility
  const startContinuousListening = () => {
    startWakeWordListening();
  };

  const stopContinuousListening = () => {
    stopWakeWordListening();
    stopListening();
  };



  // Function to send a message to the Gemini API with conversation history
  const getGeminiResponse = async (userInput: string, allMessages: Message[], isVoiceMessage: boolean = false) => {
    console.log('=== SARTHAK ASSISTANT DEBUG ===');
    console.log('User input received:', userInput);
    console.log('Is voice message:', isVoiceMessage);
    console.log('formValues received in SarthakAssistant:', JSON.stringify(formValues, null, 2));
    console.log('party received in SarthakAssistant:', JSON.stringify(party, null, 2));
    console.log('sm received in SarthakAssistant:', JSON.stringify(sm, null, 2));
    console.log('partyOptions length:', partyOptions?.length || 0);
    if (partyOptions && partyOptions.length > 0) {
      console.log('Sample party options:', partyOptions.slice(0, 5).map(p => p.label));
    }
    
    // Enhanced waiting mechanism for party options in voice messages
  if (isVoiceMessage && (!partyOptions || partyOptions.length === 0)) {
    console.log('⚠️ Party options not loaded yet for voice message, implementing enhanced wait...');
    
    // Wait up to 8 seconds for party options to load with more frequent checks
    let attempts = 0;
    const maxAttempts = 16; // 16 attempts * 500ms = 8 seconds
    
    while (attempts < maxAttempts) {
      // Check if partyOptions are now available (they might be updated in parent component)
      const currentPartyOptions = props.partyOptions;
      if (currentPartyOptions && currentPartyOptions.length > 0) {
        console.log(`✅ Party options loaded after ${attempts * 500}ms wait, found ${currentPartyOptions.length} parties`);
        // Update local partyOptions state to reflect the loaded data
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
      console.log(`⏳ Waiting for party options... attempt ${attempts}/${maxAttempts} (${attempts * 500}ms elapsed)`);
    }
    
    // Final check with current props
    const finalPartyOptions = props.partyOptions;
    if (!finalPartyOptions || finalPartyOptions.length === 0) {
      console.log('⚠️ Party options still not loaded after 8 second wait, proceeding with limited functionality...');
      // Return a helpful message to the user
      return '⏳ **Party data is still loading...**\n\nThe party list is taking longer than expected to load. This might be due to:\n\n• Network connectivity issues\n• Server response delays\n• Large dataset loading\n\nPlease try your voice command again in a moment, or manually select the party from the dropdown.';
    } else {
      console.log('✅ Party options successfully loaded, proceeding with voice command...');
    }
  }
    
    const systemPrompt = await getSystemPrompt();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations }]
    });

    const historyForApi = allMessages
      .slice(0, -1) // Exclude the last message, which is the current user input
      .map(msg => ({
        role: msg.isUser ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

    // The initial message from Sarthak should be ignored for the API history
    if (historyForApi.length > 0 && historyForApi[0].role === 'model') {
      historyForApi.shift();
    }

    const chat = model.startChat({
      history: historyForApi
    });

    // Use the most current partyOptions from props
    const currentPartyOptions = props.partyOptions || [];
    
    const contextMessage = `Current form data: ${JSON.stringify({
      party: party?.label || 'Not selected',
      amount: formValues.amount || 'Empty',
      series: formValues.series || 'Empty',
      receiptNo: formValues.receiptNo || 'Empty',
      narration: formValues.narration || 'Empty',
      date: formValues.date || 'Empty',
      discount: formValues.discount || 'Empty',
      sm: sm?.label || 'Not selected'
    })}

Available parties (${currentPartyOptions.length} total): ${currentPartyOptions.slice(0, 10).map(p => p.label).join(', ') || 'None'}

Note: When user mentions a party name in Hindi (like सुरेश, राम, etc.), extract and transliterate it to English (Suresh, Ram, etc.) before calling fuzzy_search_party function.`;
    
    console.log('Party options being sent to AI:', currentPartyOptions.length);

    console.log('Context message being sent:', contextMessage);
    console.log('=== END SARTHAK ASSISTANT DEBUG ===');

    let result = await chat.sendMessage(`${contextMessage}\n\nUser: ${userInput}`);

    while (true) {
      const functionCalls = result.response.functionCalls();
      if (!functionCalls || functionCalls.length === 0) {
        return result.response.text();
      }

      const functionResponses: Part[] = [];

      for (const functionCall of functionCalls) {
        const functionResponse = await handleFunctionCall(functionCall, props);
        functionResponses.push({
          functionResponse: {
            name: functionResponse.name,
            response: functionResponse.response
          }
        });
      }
      
      result = await chat.sendMessage(functionResponses);
    }
  };

  // Text-to-speech function
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();
      
      // Clean text for better speech (remove markdown)
      const cleanText = text
        .replace(/[#*_`]/g, '') // Remove markdown characters
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();
      
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      // Configure voice settings
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      utterance.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-IN';
      
      // Try to find a Hindi voice, fallback to default
      const voices = window.speechSynthesis.getVoices();
      const hindiVoice = voices.find(voice => 
        voice.lang.includes('hi') || voice.lang.includes('en-IN')
      );
      
      if (hindiVoice) {
        utterance.voice = hindiVoice;
      }
      
      utterance.onstart = () => {
        setIsPlaying(true);
        // Stop listening while speaking to avoid feedback
        if (isListening) {
          stopListening();
        }
        if (isWakeWordListening) {
          stopWakeWordListening();
        }
        // Start interrupt wake word listening during speech
        if (voiceEnabled) {
          setTimeout(() => {
            startInterruptWakeWordListening();
          }, 1000); // Small delay to let speech start properly
        }
      };
      
      utterance.onend = () => {
        setIsPlaying(false);
        // Stop interrupt wake word listening
        stopInterruptWakeWordListening();
        // Resume appropriate listening after speaking
        if (!isOpen) {
          setTimeout(() => {
            startWakeWordListening();
          }, 500);
        } else {
          // If assistant is open, always listen for follow-up commands
          setTimeout(() => {
            startListening();
          }, 500);
        }
      };
      
      utterance.onerror = () => {
        setIsPlaying(false);
        // Stop interrupt wake word listening on error
        stopInterruptWakeWordListening();
        // Resume appropriate listening on error
        if (!isOpen) {
          setTimeout(() => {
            startWakeWordListening();
          }, 500);
        } else {
          // If assistant is open, always listen for follow-up commands
          setTimeout(() => {
            startListening();
          }, 500);
        }
      };
      
      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Stop speech
  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      // Stop interrupt wake word listening
      stopInterruptWakeWordListening();
      // Resume appropriate listening after stopping speech
      setTimeout(() => {
        if (!isOpen) {
          startWakeWordListening();
        } else if (isWakeWordDetected) {
          startListening();
        }
      }, 100);
    }
  };

  // Toggle listening
  const toggleListening = () => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      stopWakeWordListening();
      stopListening();
    } else {
      setVoiceEnabled(true);
      if (!isOpen) {
        startWakeWordListening();
      }
    }
  };

  const handleSendMessage = async (messageText?: string, isVoiceMessage: boolean = false) => {
    console.log('handleSendMessage triggered. isVoiceMessage:', isVoiceMessage, 'isReady:', isReady);
    console.log('Current partyOptions length:', partyOptions?.length || 0);
    
    // Enhanced readiness check for both voice and text messages
    if (!isReady || !partyOptions || partyOptions.length === 0) {
      const warningMessage = isVoiceMessage 
        ? 'Party data is still loading. Please wait a moment and try again.'
        : 'Assistant is not ready yet. Please wait for party options to load.';
      
      console.warn(warningMessage);
      
      // For voice messages, provide audio feedback
      if (isVoiceMessage) {
        speakText('Party data is still loading. Please wait a moment and try your command again.');
      }
      
      // For text messages, show a helpful message in the chat
      if (!isVoiceMessage) {
        const loadingMessage: Message = {
          id: Date.now().toString(),
          text: '⏳ **Loading party data...**\n\nI\'m still loading the party information from the server. Please wait a moment and try again.',
          isUser: false,
          timestamp: new Date(),
          language: currentLanguage
        };
        setMessages(prev => [...prev, loadingMessage]);
      }
      
      return;
    }

    let textToSend = messageText || inputText;
    
    // Enhanced cleaning for voice messages
    if (isVoiceMessage || isListening) {
      console.log('=== VOICE MESSAGE PROCESSING ===');
      console.log('Original text:', JSON.stringify(textToSend));
      console.log('Original char codes:', textToSend.split('').map(c => c.charCodeAt(0)));

      // More aggressive cleaning
      const cleanedText = textToSend
        .trim()
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/[^a-zA-Z0-9\s\u0900-\u097F]/g, ''); // Allow only alphanumeric, space, and Hindi characters

      console.log('Cleaned text:', JSON.stringify(cleanedText));
      console.log('Cleaned char codes:', cleanedText.split('').map(c => c.charCodeAt(0)));
      console.log('=== END VOICE MESSAGE PROCESSING ===');
      textToSend = cleanedText;
    }
    
    if (!textToSend.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: textToSend,
      isUser: true,
      timestamp: new Date(),
      language: currentLanguage,
      isVoiceMessage: isVoiceMessage || isListening // Mark as voice message if currently listening
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    
    // Clear input text immediately
    setInputText('');

    // Stop listening before processing to avoid feedback
    if (isListening) {
      stopListening();
    }

    try {
      const aiResponseText = await getGeminiResponse(textToSend, newMessages, isVoiceMessage || isListening);

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponseText,
        isUser: false,
        timestamp: new Date(),
        language: currentLanguage
      };
      
      setMessages(prev => [...prev, aiResponse]);
      
      // Speak the response if it was a voice message or assistant is open
      if (isVoiceMessage || isListening || isOpen) {
        speakText(aiResponseText);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Resume listening on error if assistant is open
      setTimeout(() => {
        if (isWakeWordDetected && isOpen) {
          startListening();
        }
      }, 1000);
    }
  };

  // Effect to check if the component is ready for voice commands
  useEffect(() => {
    console.log('=== PARTY OPTIONS UPDATE ===');
    console.log('partyOptions received:', partyOptions?.length || 0, 'items');
    if (partyOptions && partyOptions.length > 0) {
      console.log('Sample parties:', partyOptions.slice(0, 3).map(p => p.label));
      console.log('✅ Party options are loaded, assistant is ready.');
      setIsReady(true);
    } else {
      console.log('⏳ Waiting for party options to load...');
      setIsReady(false);
    }
    console.log('=== END PARTY OPTIONS UPDATE ===');
  }, [partyOptions]);

  // Initialize voice capabilities and start wake word listening on component mount
  useEffect(() => {
    initializeVoiceCapabilities();
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (wakeWordRecognitionRef.current) {
        wakeWordRecognitionRef.current.stop();
      }
      if (interruptWakeWordRecognitionRef.current) {
        interruptWakeWordRecognitionRef.current.stop();
      }
    };
  }, []);

  // Manage wake word listening based on voice enabled state and assistant open/close
  useEffect(() => {
    const hasPartyData = partyOptions && partyOptions.length > 0;
    
    if (voiceEnabled && !isOpen && isReady && hasPartyData) {
      console.log('Attempting to start wake word listening with party data available...');
      // Add a delay to prevent race conditions and debounce rapid changes
      const timeoutId = setTimeout(() => {
        // Double-check conditions before starting
        if (voiceEnabled && !isOpen && isReady && hasPartyData && !isWakeWordListening && !isStartingWakeWordRef.current) {
          startWakeWordListening();
        }
      }, 200);
      
      return () => clearTimeout(timeoutId);
    } else if (isOpen) {
      console.log('Assistant is open, stopping wake word listening');
      stopWakeWordListening();
      // Reset wake word detection state when opening
      setIsWakeWordDetected(false);
      setHasShownActivationMessage(false);
    } else {
      console.log('Conditions not met for starting wake word listening:', { 
        voiceEnabled, 
        isOpen, 
        isReady, 
        hasPartyData,
        partyOptionsLength: partyOptions?.length || 0
      });
      stopWakeWordListening();
    }
  }, [voiceEnabled, isOpen, isReady, partyOptions]);

  // Focus input when chat opens


  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load voices when component mounts
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Load voices
      const loadVoices = () => {
        window.speechSynthesis.getVoices();
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Send message even if currently listening (allows manual override)
      if (inputText.trim()) {
        handleSendMessage(inputText.trim(), isListening); // Mark as voice if currently listening
      }
    }
  };

  return (
    <>
      {/* Floating Assistant Button */}
      <div className="fixed bottom-30 right-6 z-50 sm:bottom-6 sm:right-6 bottom-4 right-4">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className='bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white rounded-full p-4 shadow-lg transition-all duration-300 transform hover:scale-110'
            title='Ask Sarthak for help'
          >
            <ChatIcon className="w-6 h-6" />
            <div className='absolute -top-2 -right-2 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center bg-red-500 animate-pulse'>
              AI
            </div>
          </button>
        )}
      </div>

      {/* Chat Interface */}
      {isOpen && (
        <div className="fixed bottom-25 right-6 sm:bottom-6 sm:right-6 bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col sm:w-96 w-[calc(100vw-2rem)]">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-4 rounded-t-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold">स</span>
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Sarthak AI
                  {voiceEnabled && (
                    <div className="w-2 h-2 bg-blue-300 rounded-full animate-pulse" title="Always listening"></div>
                  )}
                  {isListening && (
                    <div className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse" title="Listening for command"></div>
                  )}
                  {isPlaying && (
                    <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse" title="Speaking"></div>
                  )}
                </h3>
                <p className="text-xs opacity-90">
                  {!partyOptions || partyOptions.length === 0 ? (
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-yellow-300 rounded-full animate-spin"></div>
                      Loading party data...
                    </span>
                  ) : isReady ? (
                    voiceEnabled ? 'Ready - Say "Sarthak" to start' : 'Cash Receipt Assistant Ready'
                  ) : (
                    'Initializing...'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleListening}
                className={`hover:bg-white hover:bg-opacity-20 p-1 rounded ${
                  voiceEnabled ? 'bg-white bg-opacity-20' : ''
                }`}
                title={voiceEnabled ? 'Turn off microphone' : 'Turn on microphone'}
              >
                <MicrophoneIcon className={`w-4 h-4 ${voiceEnabled ? 'text-yellow-300' : ''}`} />
              </button>
              {isPlaying && (
                <button
                  onClick={stopSpeech}
                  className="hover:bg-white hover:bg-opacity-20 p-1 rounded"
                  title="Stop speaking"
                >
                  <StopIcon className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  setHasShownActivationMessage(false); // Reset for next session
                }}
                className="hover:bg-white hover:bg-opacity-20 p-1 rounded"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    message.isUser
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {message.isUser ? (
                    <div className="text-sm whitespace-pre-line">
                      {message.isVoiceMessage ? (
                        <div className="flex items-center gap-2">
                          <MicrophoneIcon className="w-4 h-4" />
                          <span>{message.text}</span>
                        </div>
                      ) : (
                        <p>{message.text}</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm leading-relaxed">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <span className="inline">{children} </span>,
                              ul: ({ children }) => <span className="inline">{children} </span>,
                              ol: ({ children }) => <span className="inline">{children} </span>,
                              li: ({ children }) => <span className="inline">{children} </span>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                              code: ({ children }) => <code className="bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded text-xs">{children}</code>,
                              pre: ({ children }) => <code className="bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded text-xs">{children}</code>,
                              h1: ({ children }) => <strong className="font-bold">{children} </strong>,
                              h2: ({ children }) => <strong className="font-bold">{children} </strong>,
                              h3: ({ children }) => <strong className="font-semibold">{children} </strong>,
                            }}
                          >
                            {message.text}
                          </ReactMarkdown>
                        </div>
                        <button
                          onClick={() => speakText(message.text)}
                          className="flex-shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded"
                          title="Speak this message"
                        >
                          <SpeakerIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex space-x-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isListening ? 'Listening... (Press Enter to send)' : 'Type or say "Sarthak" to speak...'}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                disabled={false}
              />
              <button
                onClick={() => handleSendMessage(inputText.trim(), isListening)}
                disabled={!inputText.trim()}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white disabled:text-gray-500 dark:disabled:text-gray-400 p-2 rounded-lg transition-colors"
                title={isListening ? 'Send voice message' : 'Send message'}
              >
                <PaperPlaneIcon className="w-4 h-4" />
              </button>
            </div>
            {isListening && (
              <div className="mt-2 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  Listening for your command...
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default SarthakAssistant;