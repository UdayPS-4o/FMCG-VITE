import React, { useState, useRef, useEffect } from 'react';
import { ChatIcon, CloseIcon, PaperPlaneIcon, MicrophoneIcon, SpeakerIcon } from '../../icons';

// Voice recognition and speech synthesis interfaces
interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
  maxAlternatives: number;
    
}

declare global {
  interface Window {
    // SpeechRecognition: new () => SpeechRecognition;
   // webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechSynthesisUtterance: new () => SpeechSynthesisUtterance;
  }
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  language: 'en' | 'hi';
}

interface ShurutiAssistantProps {
  currentFormData?: {
    party?: string;
    amount?: string;
    series?: string;
    narration?: string;
    smName?: string;
  };
  onSuggestion?: (field: string, value: string) => void;
  onSubmitAndPrint?: () => void;
  user?: {
    routeAccess?: string[];
    canSelectSeries?: boolean;
    smCode?: string;
  };
}

const ShurutiAssistant: React.FC<ShurutiAssistantProps> = ({ onSuggestion, currentFormData, user, onSubmitAndPrint }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'hi'>('en');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  
  // Guided receipt creation state
  const [isGuidedMode, setIsGuidedMode] = useState(false);
  const [currentStep, setCurrentStep] = useState<'party' | 'amount' | 'series' | 'narration' | 'complete'>('party');
  const [guidedData, setGuidedData] = useState<{party?: string, amount?: string, series?: string, narration?: string}>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeWordRecognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Predefined responses in both languages
  const responses = {
    en: {
      greeting: "Hello! I'm Shuruti, your AI assistant for cash receipts. How can I help you today?",
      help: "I can help you with:\n• Filling receipt details\n• Suggesting narration text\n• Explaining form fields\n• Converting amounts to words\n• Date formatting tips\n• Split receipts (amounts over ₹20,000)\n• Saving and printing receipts\n\nTry saying 'Create receipt for [party] amount [amount]', 'Print', 'Save and Print', or ask about 'split receipts'.",
      partyHelp: "To select a party, start typing the party name or code in the Party field. The system will show matching options.",
      amountHelp: "Enter the receipt amount in numbers. If the amount exceeds ₹20,000, it will be automatically split into multiple receipts.",
      seriesHelp: "Series is a single character (A-Z) to categorize your receipts. Your default series may be pre-filled.",
      narrationHelp: "Narration is a brief description (max 25 characters) about the receipt purpose.",
      dateHelp: "Use DD-MM-YYYY format for dates. Today's date is pre-filled by default.",
      unknown: "I'm sorry, I didn't understand that. Try asking about party, amount, series, narration, or date fields."
    },
    hi: {
      greeting: "नमस्ते! मैं शुरुति हूँ, आपकी नकद रसीद raseed,rassed के लिए AI सहायक। आज मैं आपकी कैसे मदद कर सकती हूँ?",
      help: "मैं इनमें आपकी मदद कर सकती हूँ:\n• रसीद raseed,rassed विवरण भरना\n• विवरण पाठ सुझाना\n• फॉर्म फील्ड समझाना\n• राशि को शब्दों में बदलना\n• दिनांक प्रारूप सुझाव\n• विभाजित रसीदें raseed,rassed (₹20,000 से अधिक राशि)\n• रसीद raseed,rassed सेव और प्रिंट करना\n\n'[पार्टी] के लिए [राशि] की रसीद raseed,rassed बनाओ', 'प्रिंट', 'सेव और प्रिंट' कहने की कोशिश करें या 'विभाजित रसीदों raseed,rassed' के बारे में पूछें।",
      partyHelp: "पार्टी चुनने के लिए, पार्टी फील्ड में पार्टी का नाम या कोड टाइप करना शुरू करें। सिस्टम मैचिंग विकल्प दिखाएगा।",
      amountHelp: "रसीद raseed,rassed की राशि संख्या में दर्ज करें। यदि राशि ₹20,000 से अधिक है, तो यह स्वचालित रूप से कई रसीदों raseed,rassed में विभाजित हो जाएगी।",
      seriesHelp: "सीरीज़ एक अक्षर (A-Z) है जो आपकी रसीदों raseed,rassed को वर्गीकृत करने के लिए है। आपकी डिफ़ॉल्ट सीरीज़ पहले से भरी हो सकती है।",
      narrationHelp: "विवरण रसीद raseed,rassed के उद्देश्य के बारे में एक संक्षिप्त विवरण है (अधिकतम 25 अक्षर)।",
      dateHelp: "दिनांक के लिए DD-MM-YYYY प्रारूप का उपयोग करें। आज की तारीख डिफ़ॉल्ट रूप से पहले से भरी है।",
      unknown: "माफ़ करें, मैं समझ नहीं पाई। पार्टी, राशि, सीरीज़, विवरण, या दिनांक फील्ड के बारे में पूछने की कोशिश करें।"
    }
  };

  // Quick action buttons
  const quickActions = {
    en: [
      { text: "Help with Party", action: "party" },
      { text: "Amount Tips", action: "amount" },
      { text: "Series Info", action: "series" },
      { text: "Split Receipts", action: "split" }
    ],
    hi: [
      { text: "पार्टी मदद", action: "party" },
      { text: "राशि सुझाव", action: "amount" },
      { text: "सीरीज़ जानकारी", action: "series" },
      { text: "विभाजित रसीदें", action: "split" }
    ]
  };

  // Initialize voice capabilities
  useEffect(() => {
    // Check for speech recognition support
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      // Initialize regular speech recognition with Hinglish support
      //recognitionRef.current = new SpeechRecognition();
      if (recognitionRef.current) {
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        // Set to Hindi-India for better Hinglish recognition
        recognitionRef.current.lang = 'hi-IN';
        // Enable alternative recognition for mixed language
        recognitionRef.current.maxAlternatives = 3;
        
        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          // Get the best transcript from alternatives for Hinglish support
          let transcript = event.results[0][0].transcript;
          
          // Try to get better alternative if available
          if (Object.keys(event.results[0]).length > 1) {
              for (let i = 0; i < Object.keys(event.results[0]).length; i++) {
              const alternative = event.results[0][i].transcript;
              // Prefer alternatives with mixed script or common Hinglish patterns
              if (alternative.match(/[a-zA-Z].*[\u0900-\u097F]|[\u0900-\u097F].*[a-zA-Z]/) || 
                  alternative.match(/\b(kar|karo|hai|hain|kya|aur|main|mein|tum|aap|yeh|woh|kuch|koi)\b/i)) {
                transcript = alternative;
                break;
              }
            }
          }
          
          setInputText(transcript);
          setIsListening(false);
          
          // Auto-send after voice recognition completes
          setTimeout(() => {
            if (transcript.trim()) {
              handleSendMessage(transcript);
              setInputText(''); // Clear input after sending
            }
          }, 100);
        };
        
        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };
        
        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
      
      // Initialize wake word recognition with Hinglish support
      //wakeWordRecognitionRef.current = new SpeechRecognition();
      if (wakeWordRecognitionRef.current) {
        wakeWordRecognitionRef.current.continuous = true;
        wakeWordRecognitionRef.current.interimResults = true;
        // Set to Hindi-India for better Hinglish recognition
        wakeWordRecognitionRef.current.lang = 'hi-IN';
        wakeWordRecognitionRef.current.maxAlternatives = 3;
        
        wakeWordRecognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const lastResultIndex = Object.keys(event.results).length - 1;
          const transcript = event.results[lastResultIndex][0].transcript.toLowerCase();
          
          // Check for wake words in English, Hindi, and Hinglish
          const wakeWords = [
            'hey shuruti', 'hey shruti', 'shuruti', 'shruti',
            'हे श्रुति', 'हे शुरुति', 'श्रुति', 'शुरुति',
            'hey shruti ji', 'shruti ji', 'shuruti ji',
            'arre shruti', 'arre shuruti', 'suniye shruti',
            // Additional Hinglish variations
            'shruti yaar', 'shruti bhai', 'shruti didi',
            'arre yaar shruti', 'oye shruti', 'acha shruti',
            'shruti help karo', 'shruti madad karo',
            'shruti sun', 'shruti suno', 'shruti suniye',
            'ai shruti', 'computer shruti', 'system shruti'
          ];
          
          if (wakeWords.some(word => transcript.includes(word))) {
            console.log('Wake word detected:', transcript);
            
            // Stop wake word listening and start regular listening
            if (wakeWordRecognitionRef.current) {
              wakeWordRecognitionRef.current.stop();
            }
            setIsWakeWordListening(false);
            
            // Open assistant if not already open
            if (!isOpen) {
              setIsOpen(true);
            }
            
            // Start regular voice input after a short delay
            setTimeout(() => {
              startListening();
            }, 500);
            
            // Provide audio feedback with Hinglish support
            const responses = [
              'Yes, how can I help you?',
              'हाँ, मैं आपकी कैसे मदद कर सकती हूँ?',
              'Haan bolo, kya chahiye?',
              'Yes, kaise help kar sakti hun?'
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            speakText(randomResponse);
          }
        };
        
        wakeWordRecognitionRef.current.onerror = (event) => {
          console.error('Wake word recognition error:', event.error);
          // Restart wake word listening after error
          setTimeout(() => {
            startWakeWordListening();
          }, 1000);
        };
        
        wakeWordRecognitionRef.current.onend = () => {
          // Restart wake word listening if it was supposed to be active
          if (isWakeWordListening) {
            setTimeout(() => {
              startWakeWordListening();
            }, 100);
          }
        };
      }
    }
    
    // Check for speech synthesis support
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      setVoiceEnabled(true);
    }
  }, []);

  // Speech synthesis function
  const speakText = (text: string) => {
    if (synthRef.current && voiceEnabled) {
      // Cancel any ongoing speech
      synthRef.current.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-IN';
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      
      // Try to find an Indian English voice
      const voices = synthRef.current.getVoices();
      if (currentLanguage === 'en') {
        const indianVoice = voices.find(voice => 
          voice.lang.includes('en-IN') || 
          voice.name.toLowerCase().includes('india') ||
          voice.name.toLowerCase().includes('indian')
        );
        if (indianVoice) {
          utterance.voice = indianVoice;
        }
      }
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      
      synthRef.current.speak(utterance);
    }
  };

  // Start voice recognition
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  // Stop voice recognition
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Start wake word listening
  const startWakeWordListening = () => {
    if (wakeWordRecognitionRef.current && !isWakeWordListening && !isListening) {
      try {
        setIsWakeWordListening(true);
        wakeWordRecognitionRef.current.start();
        console.log('Wake word listening started');
      } catch (error) {
        console.error('Error starting wake word recognition:', error);
        setIsWakeWordListening(false);
      }
    }
  };

  // Stop wake word listening
  const stopWakeWordListening = () => {
    if (wakeWordRecognitionRef.current && isWakeWordListening) {
      wakeWordRecognitionRef.current.stop();
      setIsWakeWordListening(false);
      console.log('Wake word listening stopped');
    }
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  // Start wake word listening when component mounts and voice is enabled
  useEffect(() => {
    if (voiceEnabled && !isOpen) {
      // Start wake word listening after a short delay
      setTimeout(() => {
        startWakeWordListening();
      }, 1000);
    }
  }, [voiceEnabled]);

  // Stop wake word listening when assistant is open and restart when closed
  useEffect(() => {
    if (isOpen) {
      stopWakeWordListening();
    } else if (voiceEnabled && !isListening) {
      // Restart wake word listening when assistant is closed
      setTimeout(() => {
        startWakeWordListening();
      }, 500);
    }
  }, [isOpen]);

  // Cleanup voice resources on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
      }
      if (wakeWordRecognitionRef.current && isWakeWordListening) {
        wakeWordRecognitionRef.current.stop();
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Add welcome message
      const welcomeMessage: Message = {
        id: 'welcome',
        text: currentLanguage === 'en' 
          ? "Hello! I'm Shuruti, your AI assistant for cash receipts. You can say things like 'Create a receipt for Uday Sheety for amount 1000' and I'll automatically fill the form for you. You can also say 'Select series A-Z, Try using the microphone button for voice commands!"
          : "नमस्ते! मैं श्रुति हूँ, कैश रसीद raseed,rassed के लिए आपकी AI सहायक। आप 'उदय शेट्टी के नाम पर 1000 की रसीद raseed,rassed बनाओ' जैसी बातें कह सकते हैं और मैं आपके लिए फॉर्म भर दूंगी। आप 'सीरीज A-Z भी कह सकते हैं। आवाज़ कमांड के लिए माइक्रोफोन बटन का उपयोग करें!",
        isUser: false,
        timestamp: new Date(),
        language: currentLanguage
      };
      setMessages([welcomeMessage]);
      
      // Speak welcome message if voice is enabled
      //if (voiceEnabled) {
       // setTimeout(() => speakText(welcomeMessage.text), 1000);
      //}
    }
  }, [isOpen, currentLanguage, voiceEnabled]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Parse receipt creation commands
  const handleGuidedFlow = (userInput: string): string => {
    const input = userInput.trim();
    const lowerInput = input.toLowerCase();
    
    // Allow user to cancel guided mode
    if (lowerInput.includes('cancel') || lowerInput.includes('stop') || lowerInput.includes('exit') || 
        lowerInput.includes('रद्द') || lowerInput.includes('बंद') || lowerInput.includes('रोकें')) {
      setIsGuidedMode(false);
      setCurrentStep('party');
      setGuidedData({});
      const cancelResponses = [
        '❌ Receipt creation cancelled. How can I help you?',
        '❌ रसीद raseed,rassed निर्माण रद्द किया गया। मैं आपकी कैसे मदद कर सकती हूं?',
        '❌ Okay, cancel kar diya. Aur kya help chahiye?',
        '❌ Thik hai, receipt banane se ruk gaye. Kya aur kaam hai?'
      ];
      return cancelResponses[Math.floor(Math.random() * cancelResponses.length)];
    }
    
    // Check for party change requests at any step
    const partyChangeMatch = input.match(/(?:change|update|modify)\s+(?:party|पार्टी)\s+(?:to|को)\s+(.+)/i) ||
                            input.match(/(?:party|पार्टी)\s+(?:change|update|modify|बदलें|अपडेट)\s+(?:to|को)\s+(.+)/i) ||
                            input.match(/(?:set|सेट)\s+(?:party|पार्टी)\s+(?:to|को)\s+(.+)/i);
    
    if (partyChangeMatch) {
      const newPartyName = partyChangeMatch[1].trim();
      setGuidedData(prev => ({ ...prev, party: newPartyName }));
      
      if (onSuggestion) {
        onSuggestion('party', newPartyName);
      }
      
      // Add validation check for party change
      setTimeout(() => {
        if (!currentFormData?.party || currentFormData.party.trim() === '') {
          const partyNotFoundMessage: Message = {
            id: (Date.now() + 3).toString(),
            text: currentLanguage === 'en'
              ? `⚠️ Party "${newPartyName}" could not be found in the system. Please check the spelling or try a different party name.`
              : `⚠️ पार्टी "${newPartyName}" सिस्टम में नहीं मिली। कृपया स्पेलिंग चेक करें या कोई अलग पार्टी नाम ट्राई करें।`,
            isUser: false,
            timestamp: new Date(),
            language: currentLanguage
          };
          setMessages(prev => [...prev, partyNotFoundMessage]);
        }
      }, 1000);
      
      // Helper function to get current step prompt
      const getCurrentStepPrompt = () => {
        switch (currentStep) {
          case 'party':
            return currentLanguage === 'en'
              ? 'Now please provide the amount.'
              : 'अब कृपया राशि बताएं।';
          case 'amount':
            return currentLanguage === 'en'
              ? 'Please provide the amount.'
              : 'कृपया राशि बताएं।';
          case 'series':
            return currentLanguage === 'en'
              ? 'Please provide the series (A-Z).'
              : 'कृपया सीरीज़ (A-Z) बताएं।';
          
            return '';
        }
      };
      
      return currentLanguage === 'en'
        ? `✅ Party updated to "${newPartyName}". ${getCurrentStepPrompt()}`
        : `✅ पार्टी "${newPartyName}" में अपडेट की गई। ${getCurrentStepPrompt()}`;
    }
    
    switch (currentStep) {
      case 'party':
        if (input) {
          const newGuidedData = { ...guidedData, party: input };
          setGuidedData(newGuidedData);
          
          // Try to fill the party field
          if (onSuggestion) {
            onSuggestion('party', input);
          }
          
          // Add a timeout to check if party was successfully validated
          // Note: The actual validation happens in the parent component
          // If party is not found, the parent component will show a toast error
          // We provide a helpful message about party validation
          setTimeout(() => {
            // Check if the party field is still empty after attempting to set it
            // This is a basic check - the real validation happens in the parent component
            if (!currentFormData?.party || currentFormData.party.trim() === '') {
              // Add a message about party not being found
              const partyNotFoundMessage: Message = {
                id: (Date.now() + 2).toString(),
                text: currentLanguage === 'en'
                  ? `⚠️ Party "${input}" could not be found in the system. Please check the spelling or try a different party name. You can also type part of the name to see suggestions.`
                  : `⚠️ पार्टी "${input}" सिस्टम में नहीं मिली। कृपया स्पेलिंग चेक करें या कोई अलग पार्टी नाम ट्राई करें। आप नाम का हिस्सा भी टाइप कर सकते हैं सुझाव देखने के लिए।`,
                isUser: false,
                timestamp: new Date(),
                language: currentLanguage
              };
              setMessages(prev => [...prev, partyNotFoundMessage]);
            }
          }, 1000);
          
          // Check if amount is already set (from amount-only commands)
          if (guidedData.amount) {
            // Amount already exists, check if series is required
            if (user?.canSelectSeries !== false) {
              setCurrentStep('series');
              return currentLanguage === 'en'
                ? `✅ Party set to "${input}". Now please provide the series (A-Z).`
                : `✅ पार्टी "${input}" सेट की गई। अब कृपया सीरीज़ (A-Z) बताएं।`;
            } else {
              // Skip series and complete
              setCurrentStep('complete');
              setIsGuidedMode(false);
              return currentLanguage === 'en'
                ? `✅ Party set to "${input}". All mandatory fields are complete! Your receipt is ready to submit and print. Click "Save" to finalize the receipt.`
                : `✅ पार्टी "${input}" सेट की गई। सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद raseed,rassed सबमिट और प्रिंट के लिए तैयार है। रसीद raseed,rassed को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।`;
            }
          } else {
            // Amount not set, proceed to amount step
            setCurrentStep('amount');
            const partySetResponses = [
              `✅ Party set to "${input}". Now please provide the amount.`,
              `✅ पार्टी "${input}" सेट की गई। अब कृपया राशि बताएं।`,
              `✅ Accha, party "${input}" set kar diya. Ab amount batao.`,
              `✅ Okay, "${input}" ka naam set ho gaya. Ab kitne rupees ka receipt banayenge?`
            ];
            return partySetResponses[Math.floor(Math.random() * partySetResponses.length)];
          }
        }
        return currentLanguage === 'en'
          ? 'Please provide a valid party name.'
          : 'कृपया एक वैध पार्टी नाम बताएं।';
          
      case 'amount':
        const amountMatch = input.match(/(\d+(?:\.\d+)?)/i);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1]);
          const newGuidedData = { ...guidedData, amount: amount };
          setGuidedData({...guidedData, amount: amount.toString()});
          
          // Try to fill the amount field
          if (onSuggestion) {
            onSuggestion('amount', amount.toString());
          }
          
          // Check if series is required
          if (user?.canSelectSeries !== false) {
            setCurrentStep('series');
            const amountSetResponses = [
              `✅ Amount set to ₹${amount}. Now please provide the series (A-Z).`,
              `✅ राशि ₹${amount} सेट की गई। अब कृपया सीरीज़ (A-Z) बताएं।`,
              `✅ Accha, ₹${amount} set kar diya. Ab series batao A se Z tak.`,
              `✅ Okay, ₹${amount} ka amount ho gaya. Ab kya series chahiye - A, B, C?`
            ];
            return amountSetResponses[Math.floor(Math.random() * amountSetResponses.length)];
          } else {
            // Skip series, check if narration is needed
            setCurrentStep('narration');
            return currentLanguage === 'en'
              ? `✅ Amount set to ₹${amount}. Would you like to add any narration/description? (Optional - you can say "skip" or "no")`
              : `✅ राशि ₹${amount} सेट की गई। क्या आप कोई विवरण जोड़ना चाहते हैं? (वैकल्पिक - आप "skip" या "no" कह सकते हैं)`;
          }
        }
        return currentLanguage === 'en'
          ? 'Please provide a valid amount (numbers only).'
          : 'कृपया एक वैध राशि बताएं (केवल संख्या)।';
          
      case 'series':
        const seriesMatch = input.match(/([A-Za-z])/i);
        if (seriesMatch) {
          const series = seriesMatch[1].toUpperCase();
          const newGuidedData = { ...guidedData, series: series };
          setGuidedData(newGuidedData);
          
          // Try to fill the series field
          if (onSuggestion) {
            onSuggestion('series', series);
          }
          
          setCurrentStep('narration');
          return currentLanguage === 'en'
            ? `✅ Series set to "${series}". Would you like to add any narration/description? (Optional - you can say "skip" or "no")`
            : `✅ सीरीज़ "${series}" सेट की गई। क्या आप कोई विवरण जोड़ना चाहते हैं? (वैकल्पिक - आप "skip" या "no" कह सकते हैं)`;
        }
        return currentLanguage === 'en'
          ? 'Please provide a valid series (single letter A-Z).'
          : 'कृपया एक वैध सीरीज़ बताएं (एक अक्षर A-Z)।';
          
      case 'narration':
        const lowerInput = input.toLowerCase();
        if (lowerInput.includes('skip') || lowerInput.includes('no') || lowerInput.includes('नहीं')) {
          // Skip narration
          setCurrentStep('complete');
          setIsGuidedMode(false);
          return currentLanguage === 'en'
            ? '✅ All mandatory fields are complete! Your receipt is ready to submit and print. Click "Save" to finalize the receipt.'
            : '✅ सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद raseed,rassed सबमिट और प्रिंट के लिए तैयार है। रसीद raseed,rassed को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।';
        } else if (input.trim()) {
          // Add narration
          const newGuidedData = { ...guidedData, narration: input };
          setGuidedData(newGuidedData);
          
          if (onSuggestion) {
            onSuggestion('narration', input);
          }
          
          setCurrentStep('complete');
          setIsGuidedMode(false);
          return currentLanguage === 'en'
            ? `✅ Narration set to "${input}". All mandatory fields are complete! Your receipt is ready to submit and print. Click "Save" to finalize the receipt.`
            : `✅ विवरण "${input}" सेट किया गया। सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद raseed,rassed सबमिट और प्रिंट के लिए तैयार है। रसीद raseed,rassed को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।`;
        }
        return currentLanguage === 'en'
          ? 'Please provide narration text or say "skip" to continue.'
          : 'कृपया विवरण टेक्स्ट बताएं या जारी रखने के लिए "skip" कहें।';
          
      default:
        setIsGuidedMode(false);
        return currentLanguage === 'en'
          ? 'Guided mode completed. How can I help you further?'
          : 'गाइडेड मोड पूरा हुआ। मैं आपकी और कैसे मदद कर सकती हूं?';
    }
  };

  const parseReceiptCommand = (input: string) => {
    const lowerInput = input.toLowerCase();
    const receiptData: any = {};
    
    // Enhanced party name extraction patterns with Hinglish support
    const namePatterns = [
      // Standard English patterns
      /(?:name of|in the name of|for|receipt for)\s+["']([^"']+)["']/i,
      /(?:name of|in the name of|for|receipt for)\s+([A-Za-z\s]+?)(?:\s+for\s+amount|\s+amount|$)/i,
      // Standard Hindi patterns
      /(?:नाम|के नाम)\s+["']([^"']+)["']/i,
      /(?:नाम|के नाम)\s+([A-Za-z\s]+?)(?:\s+राशि|$)/i,
      // Hinglish patterns
      /(?:receipt|रसीद|raseed,rassed)\s+(?:banao|banaiye|kar do|karo)\s+([A-Za-z\s]+?)(?:\s+(?:ke liye|ka|ki)|\s+(?:amount|राशि)|\s+(?:rs|₹)|$)/i,
      /([A-Za-z\s]+?)\s+(?:ka|ke|ki)\s+(?:receipt|रसीद|raseed|rassed)\s+(?:banao|banaiye|kar do)/i,
      /(?:create|make|banao|banaiye|बनाओ|बनाएं).*?(?:receipt|रसीद|raseed|rassed).*?(?:in\s+name\s+of|name\s+of|for|के\s+नाम|ka|ke)\s+([A-Za-z\s]+?)(?:\s|$)/i,
      /(?:create|make|banao|banaiye|बनाओ|बनाएं).*?(?:for|के\s+लिए|ka|ke liye)\s+([A-Za-z\s]+?)(?:\s+(?:receipt|रसीद|raseed,rassed)|\s+(?:amount|राशि)|\s+(?:rs|₹)|$)/i,
      // Pattern for "5000rs receipt in name of Ritesh modi" with Hinglish
      /(?:\d+(?:\.\d+)?(?:rs|₹|rupees|rupaye)?).*?(?:receipt|रसीद|raseed|rassed).*?(?:in\s+name\s+of|name\s+of|के\s+नाम|ka|ke naam)\s+([A-Za-z\s]+?)(?:\s|$)/i,
      // Pattern for "receipt for Ritesh modi" with Hinglish
      /(?:receipt|रसीद|raseed|rassed)\s+(?:for|के\s+लिए|ka|ke liye)\s+([A-Za-z\s]+?)(?:\s+(?:amount|राशि)|\s+(?:rs|₹)|$)/i,
      // Common Hinglish patterns
      /([A-Za-z\s]+?)\s+(?:ko|ka|ke|ki)\s+(?:\d+(?:\.\d+)?(?:rs|₹|rupees|rupaye)?)/i
    ];
    
    for (const pattern of namePatterns) {
      const nameMatch = input.match(pattern);
      if (nameMatch) {
        receiptData.party = nameMatch[1].trim();
        break;
      }
    }
    
    // Enhanced amount extraction patterns with Hinglish support
    const amountPatterns = [
      // Standard patterns
      /(?:amount|for amount|राशि)\s+(\d+(?:\.\d+)?)/i,
      // Natural language patterns with Hinglish
      /(\d+(?:\.\d+)?)(?:rs|₹|rupees?|rupaye?)/i,  // 5000rs or 5000₹ or 5000rupees
      /(?:create|make|banao|banaiye|बनाओ|बनाएं).*?(\d+(?:\.\d+)?).*?(?:receipt|रसीद|raseed,rassed)/i,  // create 5000 receipt
      /(?:receipt|रसीद|raseed,rassed).*?(?:of|का|ka|ke)\s+(\d+(?:\.\d+)?)/i,  // receipt of 5000 or receipt ka 5000
      /(\d+(?:\.\d+)?)\s*(?:rupees?|रुपए|रुपये|rupaye?|taka|टका)/i,  // 5000 rupees with Hinglish variations
      // Hinglish specific patterns
      /(?:kitne|kitna|kya)\s*(?:amount|राशि|paisa|paise)?\s*(\d+(?:\.\d+)?)/i,  // kitna amount 5000
      /(\d+(?:\.\d+)?)\s*(?:ka|ke|ki)\s*(?:receipt|रसीद|raseed,rassed)/i,  // 5000 ka receipt
      /(?:paanch|das|bees|pachaas|sau|hazaar)\s*(?:rupees?|रुपये?|rupaye?)/i,  // written numbers in Hinglish
      /(\d+(?:\.\d+)?)\s*(?:wala|wali)\s*(?:receipt|रसीद|raseed,rassed)/i  // 5000 wala receipt
    ];
    
    for (const pattern of amountPatterns) {
      const amountMatch = input.match(pattern);
      if (amountMatch) {
        receiptData.amount = parseFloat(amountMatch[1]);
        break;
      }
    }
    
    // Extract series - works for both receipt creation and standalone commands
    const seriesPatterns = [
      /(?:series|सीरीज)\s*=\s*([A-Za-z])/i,  // series=A
      /(?:series|सीरीज)\s+(?:is|है)\s+([A-Za-z])/i,  // series is A
      /(?:set|सेट)\s+(?:series|सीरीज)\s+(?:to|को)\s+([A-Za-z])/i,  // set series to A
      /(?:select|choose|चुनें)\s+(?:series|सीरीज)\s+([A-Za-z])/i,  // select series A
      /(?:series|सीरीज)\s+([A-Za-z])/i  // series A
    ];

    
    for (const pattern of seriesPatterns) {
      const seriesMatch = input.match(pattern);
      if (seriesMatch) {
        receiptData.series = seriesMatch[1].toUpperCase();
        break;
      }
    }
    
    // Return data if any field was found (not just for receipt creation)
    if (receiptData.party || receiptData.amount || receiptData.series) {
      return receiptData;
    }
    
    return null;
  };

  const generateResponse = (userInput: string): string => {
    const input = userInput.toLowerCase();
    const lang = currentLanguage;

    // Handle guided receipt creation flow
    if (isGuidedMode) {
      return handleGuidedFlow(userInput);
    }

    // Check for amount-only receipt creation (e.g., "Make a receipt of Rs. 5000")
    const amountOnlyPatterns = [
      /make\s+a?\s*receipt\s+of\s+(?:rs\.?|₹)\s*(\d+)/i,
      /create\s+a?\s*receipt\s+of\s+(?:rs\.?|₹)\s*(\d+)/i,
      /generate\s+a?\s*receipt\s+of\s+(?:rs\.?|₹)\s*(\d+)/i,
      /(\d+)\s*(?:rs\.?|₹)\s*(?:ka|की)\s*receipt\s*(?:banao|बनाओ)/i,
      /(\d+)\s*(?:rupees?|रुपए?)\s*(?:ka|की)\s*receipt/i,
      /(\d+)\s*(?:रुपये?)\s*(?:की)\s*(?:रसीद|raseed,rassed)\s*(?:बनाएं|बनाओ)/i  // "5000 रुपये की रसीद raseed,rassed बनाएं"
    ];
    
    let amountOnlyMatch = null;
    for (const pattern of amountOnlyPatterns) {
      const match = input.match(pattern);
      if (match) {
        amountOnlyMatch = match;
        break;
      }
    }
    
    if (amountOnlyMatch) {
      const amount = parseInt(amountOnlyMatch[1]);
      if (amount && amount > 0) {
        // Fill only the amount and start guided mode for remaining fields
        if (onSuggestion) {
          onSuggestion('amount', amount.toString());
        }
        
        // Start guided mode for party
        setIsGuidedMode(true);
        setCurrentStep('party');
        setGuidedData({ amount: amount.toString() });
        
        const amountFilledMessage = currentLanguage === 'en'
          ? `I've set the amount to ₹${amount}. Now, please tell me the party name for this receipt.`
          : `मैंने राशि ₹${amount} सेट कर दी है। अब कृपया इस रसीद raseed,rassed के लिए पार्टी का नाम बताएं।`;
        
        // Check if amount exceeds 20,000 and inform about split receipts
        let splitMessage = '';
        if (amount > 20000) {
          splitMessage = currentLanguage === 'en'
            ? `\n\n⚠️ Note: Since the amount (₹${amount}) exceeds ₹20,000, it will be automatically split into multiple receipts of ₹20,000 or less.`
            : `\n\n⚠️ नोट: चूंकि राशि (₹${amount}) ₹20,000 से अधिक है, इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों raseed,rassed में विभाजित किया जाएगा।`;
        }
        
        return amountFilledMessage + splitMessage;
      }
    }

    // Check for natural language receipt creation commands first
    const receiptData = parseReceiptCommand(userInput);
    
    // If we have both party and amount from natural language, process directly
    if (receiptData && receiptData.party && receiptData.amount && 
        (input.includes('create') || input.includes('make') || input.includes('बनाओ') || input.includes('बनाएं')) &&
        (input.includes('receipt') || input.includes('रसीद') || input.includes('raseed,rassed'))) {
      
      const filledFields = [];
      let responseMessage = '';
      
      // Fill party field
      if (onSuggestion) {
        onSuggestion('party', receiptData.party);
        filledFields.push(`party: ${receiptData.party}`);
      }
      
      // Fill amount field
      if (onSuggestion) {
        onSuggestion('amount', receiptData.amount.toString());
        filledFields.push(`amount: ₹${receiptData.amount}`);
      }
      
      // Fill series if provided
      if (receiptData.series && onSuggestion) {
        onSuggestion('series', receiptData.series);
        filledFields.push(`series: ${receiptData.series}`);
      }
      
      responseMessage = currentLanguage === 'en'
        ? `✅ I've updated the receipt form with ${filledFields.join(', ')}. `
        : `✅ मैंने रसीद raseed,rassed फॉर्म को ${filledFields.join(', ')} के साथ अपडेट किया है। `;
      
      // Check for missing mandatory fields
      const missingFields = [];
      
      // Check series requirement
      if (user?.canSelectSeries !== false && !receiptData.series) {
        missingFields.push(currentLanguage === 'en' ? 'series (A-Z)' : 'सीरीज़ (A-Z)');
      }
      
      // Check salesman requirement
      const isAdmin = user?.routeAccess?.includes('Admin');
      const smNameRequired = !isAdmin && user?.smCode;
      if (smNameRequired && (!currentFormData?.smName || currentFormData.smName.trim() === '')) {
        missingFields.push(currentLanguage === 'en' ? 'salesman' : 'सेल्समैन');
      }
      
      if (missingFields.length > 0) {
        responseMessage += currentLanguage === 'en'
          ? `Please provide the following mandatory field(s): ${missingFields.join(', ')}.`
          : `कृपया निम्नलिखित अनिवार्य फ़ील्ड प्रदान करें: ${missingFields.join(', ')}।`;
      } else {
        responseMessage += currentLanguage === 'en'
          ? '\n\n✅ All mandatory fields are complete! Your receipt is ready to submit and print. Click "Save" to finalize the receipt.'
          : '\n\n✅ सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद raseed,rassed सबमिट और प्रिंट के लिए तैयार है। रसीद raseed,rassed को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।';
      }
      
      // Add split receipt information if amount exceeds 20,000
      if (receiptData.amount > 20000) {
        const splitMessage = currentLanguage === 'en'
          ? `\n\n⚠️ Note: Since the amount (₹${receiptData.amount}) exceeds ₹20,000, it will be automatically split into multiple receipts of ₹20,000 or less. Each split will use consecutive receipt numbers.`
          : `\n\n⚠️ नोट: चूंकि राशि (₹${receiptData.amount}) ₹20,000 से अधिक है, इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों raseed,rassed में विभाजित किया जाएगा। प्रत्येक विभाजन क्रमिक रसीद raseed,rassed नंबर का उपयोग करेगा।`;
        responseMessage += splitMessage;
      }
      
      return responseMessage;
    }
    
    // Check for "create receipt" command to start guided mode (only if no complete data found)
    // Enhanced to include Hindi and Hinglish variations
    const isCreateReceiptCommand = (
      (input.includes('create') || input.includes('make') || input.includes('बनाओ') || 
       input.includes('बनाएं') || input.includes('banao') || input.includes('banaiye')) &&
      (input.includes('receipt') || input.includes('रसीद') || input.includes('raseed,rassed') || input.includes('kar do'))
    ) || 
    // Handle standalone Hindi commands like "रसीद raseed,rassed बनाओ"
    (input.includes('रसीद') && (input.includes('बनाओ') || input.includes('बनाएं'))) ||
    // Handle Hinglish variations
    (input.includes('receipt') && (input.includes('banao') || input.includes('banaiye') || input.includes('raseed,rassed') || input.includes('kar do')));
    
    if (isCreateReceiptCommand && !receiptData?.party && !receiptData?.amount) {
      setIsGuidedMode(true);
      setCurrentStep('party');
      setGuidedData({});
      
      return currentLanguage === 'en'
        ? '📝 Let\'s create a receipt step by step. Please provide the party name.'
        : '📝 आइए चरणबद्ध तरीके से एक रसीद raseed,rassed बनाते हैं। कृपया पार्टी का नाम बताएं।';
    }

    // Check for Submit and Print commands
    const isSubmitAndPrintCommand = 
      input.includes('submit') && input.includes('print') ||
      input.includes('save') && input.includes('print') ||
      input.includes('submit and print') ||
      input.includes('save and print') ||
      input.includes('सबमिट') && input.includes('प्रिंट') ||
      input.includes('सेव') && input.includes('प्रिंट') ||
      input.includes('सबमिट और प्रिंट') ||
      input.includes('सेव और प्रिंट');

    // Check for Print command (without submit/save)
    const isPrintCommand = 
      (input.includes('print') && !input.includes('submit') && !input.includes('save')) ||
      (input.includes('प्रिंट') && !input.includes('सबमिट') && !input.includes('सेव'));

    // Check if all mandatory fields are filled first (for any user input)
    const checkMandatoryFieldsComplete = () => {
      const partyValid = currentFormData?.party && currentFormData.party.trim() !== '';
      const amountValid = currentFormData?.amount && currentFormData.amount.trim() !== '' && parseFloat(currentFormData.amount) > 0;
      const seriesValid = currentFormData?.series && currentFormData.series.trim() !== '' && currentFormData.series.length === 1;
      
      // Check if smName is required based on user role
      const isAdmin = user?.routeAccess?.includes('Admin');
      const smNameRequired = !isAdmin && user?.smCode;
      const smNameValid = !smNameRequired || (currentFormData?.smName && currentFormData.smName.trim() !== '');
      
      return partyValid && amountValid && seriesValid && smNameValid;
    };
    
    const fieldsComplete = checkMandatoryFieldsComplete();

    // Handle Submit and Print command
    if (isSubmitAndPrintCommand) {
      if (fieldsComplete && onSubmitAndPrint) {
        // Set the redirect flag and trigger submit
        console.log('AI Assistant: Setting redirectToPrint flag and calling onSubmitAndPrint');
        localStorage.setItem('redirectToPrint', 'true');
        console.log('AI Assistant: redirectToPrint flag set to:', localStorage.getItem('redirectToPrint'));
        setTimeout(() => {
          console.log('AI Assistant: Calling onSubmitAndPrint function');
          onSubmitAndPrint();
        }, 500);
        
        return currentLanguage === 'en'
          ? '✅ Submitting receipt and redirecting to print page...'
          : '✅ रसीद raseed,rassed सबमिट कर रहे हैं और प्रिंट पेज पर रीडायरेक्ट कर रहे हैं...';
      } else {
        const missingFields = [];
        if (!currentFormData?.party || currentFormData.party.trim() === '') {
          missingFields.push(currentLanguage === 'en' ? 'party' : 'पार्टी');
        }
        if (!currentFormData?.amount || currentFormData.amount.trim() === '' || parseFloat(currentFormData.amount) <= 0) {
          missingFields.push(currentLanguage === 'en' ? 'amount' : 'राशि');
        }
        if (user?.canSelectSeries !== false) {
          if (!currentFormData?.series || currentFormData.series.trim() === '' || currentFormData.series.length !== 1) {
            missingFields.push(currentLanguage === 'en' ? 'series' : 'सीरीज़');
          }
        }
        
        const isAdmin = user?.routeAccess?.includes('Admin');
        const smNameRequired = !isAdmin && user?.smCode;
        if (smNameRequired && (!currentFormData?.smName || currentFormData.smName.trim() === '')) {
          missingFields.push(currentLanguage === 'en' ? 'salesman' : 'सेल्समैन');
        }
        
        return currentLanguage === 'en'
          ? `❌ Cannot submit and print. Please fill the following mandatory fields first: ${missingFields.join(', ')}.`
          : `❌ सबमिट और प्रिंट नहीं कर सकते। कृपया पहले निम्नलिखित अनिवार्य फ़ील्ड भरें: ${missingFields.join(', ')}।`;
      }
    }

    // Handle Print command (with auto-print functionality)
    if (isPrintCommand) {
      if (fieldsComplete && onSubmitAndPrint) {
        // Set the flags for auto-print functionality
        console.log('AI Assistant: Print command - Setting redirectToPrint and autoPrint flags');
        localStorage.setItem('redirectToPrint', 'true');
        localStorage.setItem('autoPrint', 'true');
        console.log('AI Assistant: redirectToPrint flag set to:', localStorage.getItem('redirectToPrint'));
        console.log('AI Assistant: autoPrint flag set to:', localStorage.getItem('autoPrint'));
        setTimeout(() => {
          console.log('AI Assistant: Print command - Calling onSubmitAndPrint function');
          onSubmitAndPrint();
        }, 500);
        
        return currentLanguage === 'en'
          ? '🖨️ Saving receipt and automatically printing with default printer...'
          : '🖨️ रसीद raseed,rassed सेव कर रहे हैं और डिफ़ॉल्ट प्रिंटर से स्वचालित रूप से प्रिंट कर रहे हैं...';
      } else {
        const missingFields = [];
        if (!currentFormData?.party || currentFormData.party.trim() === '') {
          missingFields.push(currentLanguage === 'en' ? 'party' : 'पार्टी');
        }
        if (!currentFormData?.amount || currentFormData.amount.trim() === '' || parseFloat(currentFormData.amount) <= 0) {
          missingFields.push(currentLanguage === 'en' ? 'amount' : 'राशि');
        }
        if (user?.canSelectSeries !== false) {
          if (!currentFormData?.series || currentFormData.series.trim() === '' || currentFormData.series.length !== 1) {
            missingFields.push(currentLanguage === 'en' ? 'series' : 'सीरीज़');
          }
        }
        
        const isAdmin = user?.routeAccess?.includes('Admin');
        const smNameRequired = !isAdmin && user?.smCode;
        if (smNameRequired && (!currentFormData?.smName || currentFormData.smName.trim() === '')) {
          missingFields.push(currentLanguage === 'en' ? 'salesman' : 'सेल्समैन');
        }
        
        return currentLanguage === 'en'
          ? `❌ Cannot print. Please fill the following mandatory fields first: ${missingFields.join(', ')}.`
          : `❌ प्रिंट नहीं कर सकते। कृपया पहले निम्नलिखित अनिवार्य फ़ील्ड भरें: ${missingFields.join(', ')}।`;
      }
    }
    
    // If user asks about status or says anything and all fields are complete, remind about save
    // But don't interfere with receipt creation commands
    if (fieldsComplete && !input.includes('create') && !input.includes('make') && !input.includes('receipt') && !input.includes('बनाओ') && !input.includes('बनाएं') && !input.includes('रसीद') && !input.includes('raseed,rassed') && !input.includes('banao') && !input.includes('banaiye')) {
      const statusMessage = currentLanguage === 'en'
        ? '✅ All mandatory fields are complete! Your receipt is ready to submit and print. Click "Save" to finalize the receipt.'
        : '✅ सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद raseed,rassed सबमिट और प्रिंट के लिए तैयार है। रसीद raseed,rassed को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।';
      
      // Add context-appropriate response based on user input
      let contextResponse = '';
      if (input.includes('help') || input.includes('मदद')) {
        contextResponse = responses[lang].help + '\n\n';
      } else if (input.includes('hello') || input.includes('hi') || input.includes('नमस्ते')) {
        contextResponse = responses[lang].greeting + '\n\n';
      }
      
      return contextResponse + statusMessage;
    }
    
    // Check for invalid series and provide guidance
    if (currentFormData?.series && currentFormData.series.length > 1) {
      return currentLanguage === 'en'
        ? `⚠️ The series field should contain only one character (A-Z), but it currently contains "${currentFormData.series}". Please correct the series field to a single letter like "A", "B", etc.`
        : `⚠️ सीरीज़ फ़ील्ड में केवल एक अक्षर (A-Z) होना चाहिए, लेकिन वर्तमान में इसमें "${currentFormData.series}" है। कृपया सीरीज़ फ़ील्ड को "A", "B" आदि जैसे एक अक्षर में सुधारें।`;
    }
    
    // Check for party change requests
    const partyChangeMatch = input.match(/(?:change|update|modify)\s+(?:party|पार्टी)\s+(?:to|को)\s+(.+)/i) ||
                            input.match(/(?:party|पार्टी)\s+(?:change|update|modify|बदलें|अपडेट)\s+(?:to|को)\s+(.+)/i) ||
                            input.match(/(?:set|सेट)\s+(?:party|पार्टी)\s+(?:to|को)\s+(.+)/i);
    
    if (partyChangeMatch) {
      const newPartyName = partyChangeMatch[1].trim();
      
      if (onSuggestion) {
        onSuggestion('party', newPartyName);
        
        // Check if party was successfully set after a brief delay
        setTimeout(() => {
          if (currentFormData?.party === '') {
            // Party not found, show error message
            const errorMessage = currentLanguage === 'en'
              ? `⚠️ Could not find party "${newPartyName}". Please check the spelling or try a different name.`
              : `⚠️ पार्टी "${newPartyName}" नहीं मिली। कृपया स्पेलिंग जांचें या कोई अन्य नाम आज़माएं।`;
            
            if (responses) {
              setMessages(prev => [...prev, {
                id: Date.now().toString(),
                text: errorMessage,
                isUser: false,
                timestamp: new Date(),
                language: currentLanguage
              }]);
            }
          }
        }, 500);
      }
      
      return currentLanguage === 'en'
        ? `✅ Party changed to "${newPartyName}". Please verify the selection in the dropdown.`
        : `✅ पार्टी "${newPartyName}" में बदल दी गई। कृपया ड्रॉपडाउन में चयन की पुष्टि करें।`;
    }
    
    // Check for amount change requests
    const amountChangeMatch = input.match(/(?:change|update|modify)\s+(?:amount|राशि)\s+(?:to|को)\s+(.+)/i) ||
                             input.match(/(?:amount|राशि)\s+(?:change|update|modify|बदलें|अपडेट)\s+(?:to|को)\s+(.+)/i) ||
                             input.match(/(?:set|सेट)\s+(?:amount|राशि)\s+(?:to|को)\s+(.+)/i);
    
    if (amountChangeMatch) {
      const amountText = amountChangeMatch[1].trim();
      const amount = parseInt(amountText.replace(/[^\d]/g, ''));
      
      if (amount && amount > 0) {
        if (onSuggestion) {
          onSuggestion('amount', amount.toString());
        }
        
        let responseMessage = currentLanguage === 'en'
          ? `✅ Amount changed to ₹${amount}.`
          : `✅ राशि ₹${amount} में बदल दी गई।`;
        
        // Check if amount exceeds 20,000 and inform about split receipts
        if (amount > 20000) {
          const splitMessage = currentLanguage === 'en'
            ? ` Note: Since the amount exceeds ₹20,000, it will be automatically split into multiple receipts.`
            : ` नोट: चूंकि राशि ₹20,000 से अधिक है, इसे स्वचालित रूप से कई रसीदों raseed,rassed में विभाजित किया जाएगा।`;
          responseMessage += splitMessage;
        }
        
        return responseMessage;
      } else {
        return currentLanguage === 'en'
          ? `❌ Invalid amount "${amountText}". Please provide a valid number.`
          : `❌ अमान्य राशि "${amountText}"। कृपया एक वैध संख्या प्रदान करें।`;
      }
    }
    
    // Check for any standalone field commands (not full receipt creation)
    const standaloneReceiptData = parseReceiptCommand(userInput);
    if (standaloneReceiptData && !(input.includes('create') || input.includes('make') || input.includes('बनाओ') || input.includes('बनाएं') || input.includes('banao') || input.includes('banaiye'))) {
        let responseMessage = '';
        let filledFields = [];
        
        // Check if user is trying to set series when it's locked
        if (standaloneReceiptData.series && user?.canSelectSeries === false) {
          const seriesLockedMessage = currentLanguage === 'en' 
            ? `Series is locked for your user role and cannot be changed. Your default series will be used automatically.`
            : `आपकी उपयोगकर्ता भूमिका के लिए सीरीज़ लॉक है और इसे बदला नहीं जा सकता। आपकी डिफ़ॉल्ट सीरीज़ स्वचालित रूप से उपयोग की जाएगी।`;
          
          return seriesLockedMessage;
        }
       
       // Auto-fill the form with extracted data
        let partyValidationPending = false;
        if (standaloneReceiptData.party && onSuggestion) {
          // Try to fill the party field
          onSuggestion('party', standaloneReceiptData.party);
          partyValidationPending = true;
        }
       
       if (standaloneReceiptData.amount && onSuggestion) {
         onSuggestion('amount', standaloneReceiptData.amount.toString());
         filledFields.push(`amount: ₹${standaloneReceiptData.amount}`);
         
         // Check if amount exceeds 20,000 and inform about split receipts
         if (standaloneReceiptData.amount > 20000) {
           // Trigger the form to show split amounts immediately
           setTimeout(() => {
             if (onSuggestion) {
               // Re-trigger amount to ensure split calculation is shown
               onSuggestion('amount', standaloneReceiptData.amount.toString());
             }
           }, 100);
           
           const splitMessage = currentLanguage === 'en'
             ? `\n\n⚠️ Note: Since the amount (₹${standaloneReceiptData.amount}) exceeds ₹20,000, it will be automatically split into multiple receipts of ₹20,000 or less. You can see the split details displayed in the form above. Each split will use consecutive receipt numbers.`
             : `\n\n⚠️ नोट: चूंकि राशि (₹${standaloneReceiptData.amount}) ₹20,000 से अधिक है, इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों raseed,rassed में विभाजित किया जाएगा। आप ऊपर फॉर्म में विभाजन विवरण देख सकते हैं। प्रत्येक विभाजन क्रमिक रसीद raseed,rassed नंबर का उपयोग करेगा।`;
           responseMessage += splitMessage;
         }
       }
       
       if (standaloneReceiptData.series && onSuggestion) {
         onSuggestion('series', standaloneReceiptData.series);
         filledFields.push(`series: ${standaloneReceiptData.series}`);
       }
       
       // Handle party validation - we need to wait a moment for the onSuggestion callback to process
       if (partyValidationPending) {
         // Use a timeout to check if party was successfully set after onSuggestion processes
         setTimeout(() => {
           // This will be handled by the parent component's validation logic
           // The error message will be shown via toast, not through AI chat
         }, 100);
         
         // For now, assume party will be set and add to filled fields
         // If validation fails, the parent component will show the error toast
         filledFields.push(`party: ${standaloneReceiptData.party}`);
       }
       
       if (filledFields.length > 0) {
         responseMessage += currentLanguage === 'en'
           ? `I've updated the receipt form with ${filledFields.join(', ')}. `
           : `मैंने रसीद raseed,rassed फॉर्म को ${filledFields.join(', ')} के साथ अपडेट किया है। `;
       }
       
       // Check for missing mandatory fields and prompt
       // Note: We need to account for the data we just filled, so we merge current form data with new data
       const updatedFormData = {
         party: standaloneReceiptData.party || currentFormData?.party || '',
         amount: standaloneReceiptData.amount?.toString() || currentFormData?.amount || '',
         series: standaloneReceiptData.series || currentFormData?.series || '',
         smName: currentFormData?.smName || ''
       };
       
       const missingFields = [];
       if (!updatedFormData.party || updatedFormData.party.trim() === '') {
         missingFields.push(currentLanguage === 'en' ? 'party' : 'पार्टी');
       }
       if (!updatedFormData.amount || updatedFormData.amount.trim() === '' || parseFloat(updatedFormData.amount) <= 0) {
         missingFields.push(currentLanguage === 'en' ? 'amount' : 'राशि');
       } else {
         // Check if amount exceeds 20,000 and inform about split receipts (only if not already mentioned)
         const amount = parseFloat(updatedFormData.amount);
         if (amount > 20000 && !responseMessage.includes('split')) {
           const splitMessage = currentLanguage === 'en'
             ? `\n\n⚠️ Note: Since the amount (₹${amount}) exceeds ₹20,000, it will be automatically split into multiple receipts of ₹20,000 or less. Each split will use consecutive receipt numbers.`
             : `\n\n⚠️ नोट: चूंकि राशि (₹${amount}) ₹20,000 से अधिक है, इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों raseed,rassed में विभाजित किया जाएगा।`;
           responseMessage += splitMessage;
         }
       }
       // Only check series if user can select it (not locked for regular users)
        if (user?.canSelectSeries !== false) {
          if (!updatedFormData.series || updatedFormData.series.trim() === '' || updatedFormData.series.length !== 1) {
            missingFields.push(currentLanguage === 'en' ? 'series' : 'सीरीज़');
          }
        }
        
        // Add smName check only if it's required based on user role
        const isAdmin = user?.routeAccess?.includes('Admin');
        const smNameRequired = !isAdmin && user?.smCode;
        if (smNameRequired && (!updatedFormData.smName || updatedFormData.smName.trim() === '')) {
          missingFields.push(currentLanguage === 'en' ? 'salesman' : 'सेल्समैन');
        }
       
       if (missingFields.length > 0) {
         responseMessage += currentLanguage === 'en'
           ? `Please provide the following mandatory field(s): ${missingFields.join(', ')}. You can say something like "series is A" or "set series to A".`
           : `कृपया निम्नलिखित अनिवार्य फ़ील्ड प्रदान करें: ${missingFields.join(', ')}। आप "सीरीज A है" जैसा कह सकते हैं।`;
       } else {
         // All mandatory fields are filled
         responseMessage += currentLanguage === 'en'
           ? '\n\n✅ All mandatory fields are complete! Your receipt is ready to submit and print. Click "Save" to finalize the receipt.'
           : '\n\n✅ सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद raseed,rassed सबमिट और प्रिंट के लिए तैयार है। रसीद raseed,rassed को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।';
       }
       
       // Ask about optional fields only if mandatory fields are missing
       if (missingFields.length === 0) {
         const optionalPrompts = [];
         if (!currentFormData?.narration) {
           optionalPrompts.push(currentLanguage === 'en' ? 'any narration or description' : 'कोई विवरण');
         }
         
         if (optionalPrompts.length > 0) {
           responseMessage += currentLanguage === 'en'
             ? `\n\nOptionally, you can add ${optionalPrompts.join(' or ')} or mention any discount if applicable.`
             : `\n\nवैकल्पिक रूप से, आप ${optionalPrompts.join(' या ')} जोड़ सकते हैं या यदि लागू हो तो कोई छूट बता सकते हैं।`;
         }
       }
       
       return responseMessage;
     }

    if (input.includes('help') || input.includes('मदद')) {
      return responses[lang].help;
    } else if (input.includes('party') || input.includes('पार्टी')) {
      return responses[lang].partyHelp + (currentLanguage === 'en' ? " Or just say 'Create a receipt for [party name]'." : "");
    } else if (input.includes('amount') || input.includes('राशि')) {
      const splitInfo = currentLanguage === 'en'
        ? "\n\n💡 Tip: If you enter an amount over ₹20,000, it will be automatically split into multiple receipts of ₹20,000 or less for compliance purposes."
        : "\n\n💡 सुझाव: यदि आप ₹20,000 से अधिक की राशि दर्ज करते हैं, तो अनुपालन उद्देश्यों के लिए इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों raseed,rassed में विभाजित किया जाएगा।";
      return responses[lang].amountHelp + (currentLanguage === 'en' ? " You can also say 'Create receipt for amount 1000'." : "") + splitInfo;
    } else if (input.includes('series') || input.includes('सीरीज')) {
      return responses[lang].seriesHelp;
    } else if (input.includes('narration') || input.includes('विवरण')) {
      return responses[lang].narrationHelp;
    } else if (input.includes('date') || input.includes('दिनांक') || input.includes('तारीख')) {
      return responses[lang].dateHelp;
    } else if (input.includes('split') || input.includes('विभाजन') || input.includes('बांटना')) {
      return currentLanguage === 'en'
        ? "📋 **Split Receipts Information:**\n\nWhen you enter an amount over ₹20,000, the system automatically splits it into multiple receipts:\n• Each split will be ₹20,000 or less\n• Consecutive receipt numbers will be used\n• All splits will have the same series and party\n• Discount (if any) applies only to the first split\n\nFor example: ₹45,000 becomes three receipts of ₹20,000, ₹20,000, and ₹5,000."
        : "📋 **विभाजित रसीदों raseed,rassed की जानकारी:**\n\nजब आप ₹20,000 से अधिक की राशि दर्ज करते हैं, तो सिस्टम स्वचालित रूप से इसे कई रसीदों raseed,rassed में विभाजित कर देता है:\n• प्रत्येक विभाजन ₹20,000 या उससे कम होगा\n• क्रमिक रसीद raseed,rassed नंबर का उपयोग किया जाएगा\n• सभी विभाजनों में समान सीरीज़ और पार्टी होगी\n• छूट (यदि कोई हो) केवल पहले विभाजन पर लागू होती है\n\nउदाहरण: ₹45,000 तीन रसीदों raseed,rassed में बंट जाता है - ₹20,000, ₹20,000, और ₹5,000।";
    } else if (input.includes('hello') || input.includes('hi') || input.includes('नमस्ते')) {
      return responses[lang].greeting;
    } else {
      return currentLanguage === 'en'
        ? "Hi! I'm Shuruti, your cash receipt assistant. You can say things like 'Create a receipt for Uday Shetty for amount 1000' and I'll help fill the form. " + responses[lang].unknown
        : "नमस्ते! मैं श्रुति हूँ, आपकी कैश रसीद raseed,rassed सहायक। आप 'उदय शेट्टी के नाम पर 1000 की रसीद raseed,rassed बनाओ' जैसी बातें कह सकते हैं। " + responses[lang].unknown;
    }
  };

  const handleSendMessage = (messageText?: string) => {
    const textToSend = messageText || inputText;
    if (!textToSend.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: textToSend,
      isUser: true,
      timestamp: new Date(),
      language: currentLanguage
    };

    setMessages(prev => [...prev, userMessage]);

    // Generate AI response
    setTimeout(() => {
      const response = generateResponse(textToSend);
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        isUser: false,
        timestamp: new Date(),
        language: currentLanguage
      };
      setMessages(prev => [...prev, aiResponse]);
      
      // Speak the response if voice is enabled
      if (voiceEnabled) {
        speakText(response);
      }
    }, 500);

    setInputText('');
  };

  const handleQuickAction = (action: string) => {
    const responses_map = {
      party: responses[currentLanguage].partyHelp,
      amount: responses[currentLanguage].amountHelp,
      series: responses[currentLanguage].seriesHelp,
      date: responses[currentLanguage].dateHelp
    };

    const aiResponse: Message = {
      id: Date.now().toString(),
      text: responses_map[action as keyof typeof responses_map],
      isUser: false,
      timestamp: new Date(),
      language: currentLanguage
    };

    setMessages(prev => [...prev, aiResponse]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Floating Assistant Button */}
      <div className="fixed bottom-25 right-6 z-50 sm:bottom-6 sm:right-6 bottom-4 right-4">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className={`bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full p-4 shadow-lg transition-all duration-300 transform hover:scale-110 ${
              isWakeWordListening ? 'ring-4 ring-green-300 ring-opacity-50 animate-pulse' : ''
            }`}
            title={isWakeWordListening ? 'Say "Hey Shuruti" to activate' : 'Ask Shuruti for help'}
          >
            <ChatIcon className="w-6 h-6" />
            <div className={`absolute -top-2 -right-2 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center ${
              isWakeWordListening ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-pulse'
            }`}>
              {isWakeWordListening ? '👂' : 'AI'}
            </div>
          </button>
        )}
      </div>

      {/* Chat Interface */}
      {isOpen && (
        <div className="fixed bottom-25 right-6 sm:bottom-6 sm:right-6 bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col sm:w-96 w-[calc(100vw-2rem)]">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-t-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold">श</span>
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Shuruti AI
                  {voiceEnabled && (
                    <span className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded-full">
                      {currentLanguage === 'en' ? 'Voice' : 'आवाज़'}
                    </span>
                  )}
                  {isWakeWordListening && !isOpen && (
                    <span className="text-xs bg-green-400 bg-opacity-80 px-2 py-1 rounded-full animate-pulse">
                      {currentLanguage === 'en' ? 'Wake Word Active' : 'वेक वर्ड सक्रिय'}
                    </span>
                  )}
                  {isListening && (
                    <span className="text-xs bg-red-400 bg-opacity-80 px-2 py-1 rounded-full animate-pulse">
                      {currentLanguage === 'en' ? 'Listening...' : 'सुन रहा है...'}
                    </span>
                  )}
                  {isSpeaking && (
                    <span className="text-xs bg-blue-400 bg-opacity-80 px-2 py-1 rounded-full animate-pulse">
                      {currentLanguage === 'en' ? 'Speaking...' : 'बोल रहा है...'}
                    </span>
                  )}
                </h3>
                <p className="text-xs opacity-90">Cash Receipt Assistant</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* Language Toggle */}
              <button
                onClick={() => setCurrentLanguage(currentLanguage === 'en' ? 'hi' : 'en')}
                className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded"
              >
                {currentLanguage === 'en' ? 'हिं' : 'EN'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
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
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{message.text}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2">
              <div className="grid grid-cols-2 gap-2">
                {quickActions[currentLanguage].map((action, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickAction(action.action)}
                    className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded transition-colors"
                  >
                    {action.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex space-x-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={currentLanguage === 'en' ? 'Ask me anything...' : 'कुछ भी पूछें...'}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white text-sm"
              />
              
              {/* Voice controls */}
              {voiceEnabled && (
                <>
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`p-2 rounded-lg transition-colors ${
                      isListening 
                        ? 'bg-red-500 text-white hover:bg-red-600' 
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                  >
                    <MicrophoneIcon className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
                  </button>
                  
                  <button
                    onClick={isSpeaking ? stopSpeaking : () => {}}
                    disabled={!isSpeaking}
                    className={`p-2 rounded-lg transition-colors ${
                      isSpeaking 
                        ? 'bg-green-500 text-white hover:bg-green-600' 
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                    title={isSpeaking ? 'Stop speaking' : 'Voice output'}
                  >
                    <SpeakerIcon className={`w-4 h-4 ${isSpeaking ? 'animate-pulse' : ''}`} />
                  </button>
                </>
              )}
              
              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={!inputText.trim()}
                className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white disabled:text-gray-500 dark:disabled:text-gray-400 p-2 rounded-lg transition-colors"
              >
                <PaperPlaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ShurutiAssistant;