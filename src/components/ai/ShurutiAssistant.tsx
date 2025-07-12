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
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
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
      greeting: "नमस्ते! मैं शुरुति हूँ, आपकी नकद रसीद के लिए AI सहायक। आज मैं आपकी कैसे मदद कर सकती हूँ?",
      help: "मैं इनमें आपकी मदद कर सकती हूँ:\n• रसीद विवरण भरना\n• विवरण पाठ सुझाना\n• फॉर्म फील्ड समझाना\n• राशि को शब्दों में बदलना\n• दिनांक प्रारूप सुझाव\n• विभाजित रसीदें (₹20,000 से अधिक राशि)\n• रसीद सेव और प्रिंट करना\n\n'[पार्टी] के लिए [राशि] की रसीद बनाओ', 'प्रिंट', 'सेव और प्रिंट' कहने की कोशिश करें या 'विभाजित रसीदों' के बारे में पूछें।",
      partyHelp: "पार्टी चुनने के लिए, पार्टी फील्ड में पार्टी का नाम या कोड टाइप करना शुरू करें। सिस्टम मैचिंग विकल्प दिखाएगा।",
      amountHelp: "रसीद की राशि संख्या में दर्ज करें। यदि राशि ₹20,000 से अधिक है, तो यह स्वचालित रूप से कई रसीदों में विभाजित हो जाएगी।",
      seriesHelp: "सीरीज़ एक अक्षर (A-Z) है जो आपकी रसीदों को वर्गीकृत करने के लिए है। आपकी डिफ़ॉल्ट सीरीज़ पहले से भरी हो सकती है।",
      narrationHelp: "विवरण रसीद के उद्देश्य के बारे में एक संक्षिप्त विवरण है (अधिकतम 25 अक्षर)।",
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
      
      // Initialize regular speech recognition
      recognitionRef.current = new SpeechRecognition();
      if (recognitionRef.current) {
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-US';
        
        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          setInputText(transcript);
          setIsListening(false);
        };
        
        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };
        
        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
      
      // Initialize wake word recognition
      wakeWordRecognitionRef.current = new SpeechRecognition();
      if (wakeWordRecognitionRef.current) {
        wakeWordRecognitionRef.current.continuous = true;
        wakeWordRecognitionRef.current.interimResults = true;
        wakeWordRecognitionRef.current.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-US';
        
        wakeWordRecognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const lastResultIndex = Object.keys(event.results).length - 1;
          const transcript = event.results[lastResultIndex][0].transcript.toLowerCase();
          
          // Check for wake words
          if (transcript.includes('hey shuruti') || transcript.includes('hey shruti') || 
              transcript.includes('हे श्रुति') || transcript.includes('हे शुरुति')) {
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
            
            // Provide audio feedback
            speakText(currentLanguage === 'en' ? 'Yes, how can I help you?' : 'हाँ, मैं आपकी कैसे मदद कर सकती हूँ?');
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
  }, [currentLanguage]);

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
          : "नमस्ते! मैं श्रुति हूँ, कैश रसीद के लिए आपकी AI सहायक। आप 'उदय शेट्टी के नाम पर 1000 की रसीद बनाओ' जैसी बातें कह सकते हैं और मैं आपके लिए फॉर्म भर दूंगी। आप 'सीरीज A-Z भी कह सकते हैं। आवाज़ कमांड के लिए माइक्रोफोन बटन का उपयोग करें!",
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
  const parseReceiptCommand = (input: string) => {
    const lowerInput = input.toLowerCase();
    const receiptData: any = {};
    
    // Extract party name (with or without quotes) - works for both receipt creation and standalone
    const nameMatch = input.match(/(?:name of|in the name of|for|receipt for)\s+["']([^"']+)["']/i) ||
                     input.match(/(?:name of|in the name of|for|receipt for)\s+([A-Za-z\s]+?)(?:\s+for\s+amount|\s+amount|$)/i) ||
                     input.match(/(?:नाम|के नाम)\s+["']([^"']+)["']/i) ||
                     input.match(/(?:नाम|के नाम)\s+([A-Za-z\s]+?)(?:\s+राशि|$)/i);
    if (nameMatch) {
      receiptData.party = (nameMatch[1] || nameMatch[2]).trim();
    }
    
    // Extract amount - works for both receipt creation and standalone
    const amountMatch = input.match(/(?:amount|for amount|राशि)\s+(\d+(?:\.\d+)?)/i);
    if (amountMatch) {
      receiptData.amount = parseFloat(amountMatch[1]);
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
          : '✅ रसीद सबमिट कर रहे हैं और प्रिंट पेज पर रीडायरेक्ट कर रहे हैं...';
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

    // Handle Print command (same functionality as Save and Print)
    if (isPrintCommand) {
      if (fieldsComplete && onSubmitAndPrint) {
        // Set the redirect flag and trigger submit
        console.log('AI Assistant: Print command - Setting redirectToPrint flag and calling onSubmitAndPrint');
        localStorage.setItem('redirectToPrint', 'true');
        console.log('AI Assistant: redirectToPrint flag set to:', localStorage.getItem('redirectToPrint'));
        setTimeout(() => {
          console.log('AI Assistant: Print command - Calling onSubmitAndPrint function');
          onSubmitAndPrint();
        }, 500);
        
        return currentLanguage === 'en'
          ? '🖨️ Saving receipt and redirecting to print page...'
          : '🖨️ रसीद सेव कर रहे हैं और प्रिंट पेज पर रीडायरेक्ट कर रहे हैं...';
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
    if (fieldsComplete && !input.includes('create') && !input.includes('receipt') && !input.includes('बनाओ') && !input.includes('रसीद')) {
      const statusMessage = currentLanguage === 'en'
        ? '✅ All mandatory fields are complete! Your receipt is ready to submit and print. Click "Save" to finalize the receipt.'
        : '✅ सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद सबमिट और प्रिंट के लिए तैयार है। रसीद को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।';
      
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
    
    // Check for any command that fills form fields (receipt creation or standalone field commands)
      const receiptData = parseReceiptCommand(userInput);
      if (receiptData) {
        let responseMessage = '';
        let filledFields = [];
        
        // Check if user is trying to set series when it's locked
        if (receiptData.series && user?.canSelectSeries === false) {
          const seriesLockedMessage = currentLanguage === 'en' 
            ? `Series is locked for your user role and cannot be changed. Your default series will be used automatically.`
            : `आपकी उपयोगकर्ता भूमिका के लिए सीरीज़ लॉक है और इसे बदला नहीं जा सकता। आपकी डिफ़ॉल्ट सीरीज़ स्वचालित रूप से उपयोग की जाएगी।`;
          
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: seriesLockedMessage,
            isUser: false,
            timestamp: new Date(),
            language: currentLanguage
          }]);
          return;
        }
       
       // Auto-fill the form with extracted data
        if (receiptData.party && onSuggestion) {
          // Always try to fill the party field
          onSuggestion('party', receiptData.party);
          filledFields.push(`party: ${receiptData.party}`);
          
          // Note: The actual party validation will happen in the form component
          // If party is not found in the dropdown, user will need to select or add it
        }
       
       if (receiptData.amount && onSuggestion) {
         onSuggestion('amount', receiptData.amount.toString());
         filledFields.push(`amount: ₹${receiptData.amount}`);
         
         // Check if amount exceeds 20,000 and inform about split receipts
         if (receiptData.amount > 20000) {
           // Trigger the form to show split amounts immediately
           setTimeout(() => {
             if (onSuggestion) {
               // Re-trigger amount to ensure split calculation is shown
               onSuggestion('amount', receiptData.amount.toString());
             }
           }, 100);
           
           const splitMessage = currentLanguage === 'en'
             ? `\n\n⚠️ Note: Since the amount (₹${receiptData.amount}) exceeds ₹20,000, it will be automatically split into multiple receipts of ₹20,000 or less. You can see the split details displayed in the form above. Each split will use consecutive receipt numbers.`
             : `\n\n⚠️ नोट: चूंकि राशि (₹${receiptData.amount}) ₹20,000 से अधिक है, इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों में विभाजित किया जाएगा। आप ऊपर फॉर्म में विभाजन विवरण देख सकते हैं। प्रत्येक विभाजन क्रमिक रसीद नंबर का उपयोग करेगा।`;
           responseMessage += splitMessage;
         }
       }
       
       if (receiptData.series && onSuggestion) {
         onSuggestion('series', receiptData.series);
         filledFields.push(`series: ${receiptData.series}`);
       }
       
       if (filledFields.length > 0) {
         responseMessage += currentLanguage === 'en'
           ? `I've filled the receipt form with ${filledFields.join(', ')}. `
           : `मैंने रसीद फॉर्म को ${filledFields.join(', ')} के साथ भर दिया है। `;
       }
       
       // Check for missing mandatory fields and prompt
       // Note: We need to account for the data we just filled, so we merge current form data with new data
       const updatedFormData = {
         party: receiptData.party || currentFormData?.party || '',
         amount: receiptData.amount?.toString() || currentFormData?.amount || '',
         series: receiptData.series || currentFormData?.series || '',
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
             : `\n\n⚠️ नोट: चूंकि राशि (₹${amount}) ₹20,000 से अधिक है, इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों में विभाजित किया जाएगा।`;
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
           : '\n\n✅ सभी अनिवार्य फ़ील्ड पूर्ण हैं! आपकी रसीद सबमिट और प्रिंट के लिए तैयार है। रसीद को अंतिम रूप देने के लिए "सेव" पर क्लिक करें।';
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
        : "\n\n💡 सुझाव: यदि आप ₹20,000 से अधिक की राशि दर्ज करते हैं, तो अनुपालन उद्देश्यों के लिए इसे स्वचालित रूप से ₹20,000 या उससे कम की कई रसीदों में विभाजित किया जाएगा।";
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
        : "📋 **विभाजित रसीदों की जानकारी:**\n\nजब आप ₹20,000 से अधिक की राशि दर्ज करते हैं, तो सिस्टम स्वचालित रूप से इसे कई रसीदों में विभाजित कर देता है:\n• प्रत्येक विभाजन ₹20,000 या उससे कम होगा\n• क्रमिक रसीद नंबर का उपयोग किया जाएगा\n• सभी विभाजनों में समान सीरीज़ और पार्टी होगी\n• छूट (यदि कोई हो) केवल पहले विभाजन पर लागू होती है\n\nउदाहरण: ₹45,000 तीन रसीदों में बंट जाता है - ₹20,000, ₹20,000, और ₹5,000।";
    } else if (input.includes('hello') || input.includes('hi') || input.includes('नमस्ते')) {
      return responses[lang].greeting;
    } else {
      return currentLanguage === 'en'
        ? "Hi! I'm Shuruti, your cash receipt assistant. You can say things like 'Create a receipt for Uday Shetty for amount 1000' and I'll help fill the form. " + responses[lang].unknown
        : "नमस्ते! मैं श्रुति हूँ, आपकी कैश रसीद सहायक। आप 'उदय शेट्टी के नाम पर 1000 की रसीद बनाओ' जैसी बातें कह सकते हैं। " + responses[lang].unknown;
    }
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
      language: currentLanguage
    };

    setMessages(prev => [...prev, userMessage]);

    // Generate AI response
    setTimeout(() => {
      const response = generateResponse(inputText);
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
      <div className="fixed bottom-6 right-6 z-50">
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
        <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col">
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
                onClick={handleSendMessage}
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