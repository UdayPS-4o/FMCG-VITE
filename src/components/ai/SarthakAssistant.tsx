import React, { useState, useEffect, useRef } from 'react';
import { ChatBubbleLeftIcon as ChatIcon, XMarkIcon as CloseIcon, MicrophoneIcon, PaperAirplaneIcon as PaperPlaneIcon, SpeakerWaveIcon as SpeakerIcon } from '@heroicons/react/24/solid';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { toast } from 'react-toastify';
import ReactMarkdown from 'react-markdown';

// Define the Message type
interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  language: 'en' | 'hi';
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

const SarthakAssistant: React.FC<SarthakAssistantProps> = ({ 
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial',
      text: 'Namaste! Main Sarthak hoon, aapka cash receipt sahayak. Aapko receipt banane mein kaise madad kar sakta hoon?',
      isUser: false,
      timestamp: new Date(),
      language: 'hi'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'hi'>('hi');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const inputRef = useRef<null | HTMLInputElement>(null);

  const GEMINI_API_KEY = 'AIzaSyCwumSpS0w2Of-V28mMebVcIBihscxsOqg';
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

  // Define function declarations using proper SDK format
  const createReceiptDeclaration: FunctionDeclaration = {
    name: 'create_receipt',
    description: 'Creates a new cash receipt. Use this when the user explicitly asks to create a receipt.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        party: { type: SchemaType.STRING, description: 'The name of the person or entity for whom the receipt is created.' },
        amount: { type: SchemaType.NUMBER, description: 'The amount of the receipt.' },
        series: { type: SchemaType.STRING, description: 'The series of the receipt (e.g., A, B, C).' },
        narration: { type: SchemaType.STRING, description: 'Any additional notes or description for the receipt.' }
      },
      required: ['party', 'amount']
    }
  };

  const updateReceiptFieldDeclaration: FunctionDeclaration = {
    name: 'update_receipt_field',
    description: 'Updates a specific field on the receipt form.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        field: { type: SchemaType.STRING, description: 'The name of the field to update (e.g., party, amount, series, narration).' },
        value: { type: SchemaType.STRING, description: 'The new value for the field.' }
      },
      required: ['field', 'value']
    }
  };

  const submitAndPrintReceiptDeclaration: FunctionDeclaration = {
    name: 'submit_and_print_receipt',
    description: 'Submits the current receipt and prepares it for printing.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  };

  const getReceiptInfoDeclaration: FunctionDeclaration = {
    name: 'get_receipt_info',
    description: 'Gets information about the current receipt including next receipt number and series info.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  };

  const searchPartyDeclaration: FunctionDeclaration = {
    name: 'search_party',
    description: 'Searches for a party by name or code.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        searchTerm: { type: SchemaType.STRING, description: 'The name or code to search for.' }
      },
      required: ['searchTerm']
    }
  };

  const calculateAmountDeclaration: FunctionDeclaration = {
    name: 'calculate_amount',
    description: 'Performs calculations on amounts (add, subtract, multiply, divide).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        operation: { type: SchemaType.STRING, description: 'The operation to perform: add, subtract, multiply, divide.' },
        value1: { type: SchemaType.NUMBER, description: 'First value for calculation.' },
        value2: { type: SchemaType.NUMBER, description: 'Second value for calculation.' }
      },
      required: ['operation', 'value1', 'value2']
    }
  };

  const validateReceiptDeclaration: FunctionDeclaration = {
    name: 'validate_receipt',
    description: 'Validates the current receipt form for completeness and correctness.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  };

  const getPartyBalanceDeclaration: FunctionDeclaration = {
    name: 'get_party_balance',
    description: 'Gets the current balance for a specific party.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        partyCode: { type: SchemaType.STRING, description: 'The party code to get balance for.' }
      },
      required: ['partyCode']
    }
  };

  const splitAmountDeclaration: FunctionDeclaration = {
    name: 'split_amount',
    description: 'Splits a large amount into smaller amounts based on limits.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        amount: { type: SchemaType.NUMBER, description: 'The amount to split.' }
      },
      required: ['amount']
    }
  };

  const clearFormDeclaration: FunctionDeclaration = {
    name: 'clear_form',
    description: 'Clears all form fields to start fresh.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  };

  const setDateDeclaration: FunctionDeclaration = {
    name: 'set_date',
    description: 'Sets the receipt date to a specific date.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: { type: SchemaType.STRING, description: 'The date in DD-MM-YYYY format.' }
      },
      required: ['date']
    }
  };

  const getReceiptHistoryDeclaration: FunctionDeclaration = {
    name: 'get_receipt_history',
    description: 'Gets recent receipt history for reference.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit: { type: SchemaType.NUMBER, description: 'Number of recent receipts to fetch (default 10).' }
      }
    }
  };

  const fuzzySearchPartyDeclaration: FunctionDeclaration = {
    name: 'fuzzy_search_party',
    description: 'Performs fuzzy search for party names and provides multiple options if more than one match is found.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        searchTerm: { type: SchemaType.STRING, description: 'The name or partial name to search for.' },
        selectOption: { type: SchemaType.NUMBER, description: 'Option number to select from search results (1-based index).' }
      },
      required: ['searchTerm']
    }
  };

  const printReceiptDeclaration: FunctionDeclaration = {
    name: 'print_receipt',
    description: 'Saves the current receipt and automatically prints it using the default printer.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  };

  // Helper function to calculate fuzzy matching score
  const calculateFuzzyScore = (text: string, searchTerm: string): number => {
    if (!text || !searchTerm) return 0;
    
    let score = 0;
    let searchIndex = 0;
    
    for (let i = 0; i < text.length && searchIndex < searchTerm.length; i++) {
      if (text[i] === searchTerm[searchIndex]) {
        score += 10;
        searchIndex++;
      } else if (text[i].toLowerCase() === searchTerm[searchIndex].toLowerCase()) {
        score += 8;
        searchIndex++;
      }
    }
    
    // Bonus for completing the search term
    if (searchIndex === searchTerm.length) {
      score += 20;
    }
    
    // Penalty for length difference
    const lengthDiff = Math.abs(text.length - searchTerm.length);
    score -= lengthDiff * 2;
    
    return Math.max(0, score);
  };

  // Function to send a message to the Gemini API with conversation history
  const getGeminiResponse = async (userInput: string) => {
    const systemPrompt = await getSystemPrompt();

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: systemPrompt,
        tools: [{
          functionDeclarations: [
            createReceiptDeclaration,
            updateReceiptFieldDeclaration,
            submitAndPrintReceiptDeclaration,
            printReceiptDeclaration,
            getReceiptInfoDeclaration,
            searchPartyDeclaration,
            fuzzySearchPartyDeclaration,
            calculateAmountDeclaration,
            validateReceiptDeclaration,
            getPartyBalanceDeclaration,
            splitAmountDeclaration,
            clearFormDeclaration,
            setDateDeclaration,
            getReceiptHistoryDeclaration
          ]
        }]
      });

      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.isUser ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      // Ensure the first message is from user for Gemini API validation
      if (conversationHistory.length > 0 && conversationHistory[0].role !== 'user') {
        conversationHistory.unshift({
          role: 'user',
          parts: [{ text: 'Hello, I need help with cash receipt management.' }]
        });
      }

      // Add current form data context
      const contextMessage = `Current form data: ${JSON.stringify({
        party: party?.label || 'Not selected',
        amount: formValues.amount || 'Empty',
        series: formValues.series || 'Empty',
        receiptNo: formValues.receiptNo || 'Empty',
        narration: formValues.narration || 'Empty',
        date: formValues.date || 'Empty',
        discount: formValues.discount || 'Empty',
        sm: sm?.label || 'Not selected'
      })}`;

      // Start chat with history
      const chat = model.startChat({
        history: conversationHistory
      });

      const result = await chat.sendMessage(`${contextMessage}\n\nUser: ${userInput}`);
      const response = result.response;

      // Check if there are function calls
      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        // Handle multiple function calls sequentially
        const results = [];
        for (const functionCall of functionCalls) {
          const functionResult = handleFunctionCall(functionCall);
          if (functionResult) {
            results.push(functionResult);
          }
        }
        return results.length > 0 ? results.join('\n\n---\n\n') : `Executed ${functionCalls.length} action(s)`;
      } else {
        // Return the text response
        return response.text() || 'Sorry, I could not process that.';
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      return 'Sorry, something went wrong.';
    }
  };

  const handleFunctionCall = (functionCall: any): string => {
    const { name, args } = functionCall;
    
    switch (name) {
      case 'create_receipt':
        console.log('Creating receipt with:', args);
        if (onSuggestion) {
          if (args.party) onSuggestion('party', args.party);
          if (args.amount) onSuggestion('amount', args.amount.toString());
          if (args.series) onSuggestion('series', args.series);
          if (args.narration) onSuggestion('narration', args.narration);
        }
        toast.success(`Receipt created for ${args.party} with amount ₹${args.amount}`);
        break;
        
      case 'update_receipt_field':
        console.log('Updating receipt field:', args);
        if (onSuggestion) {
          onSuggestion(args.field, args.value);
        }
        toast.success(`Updated ${args.field} to ${args.value}`);
        break;
        
      case 'submit_and_print_receipt':
        console.log('Submitting and printing receipt');
        if (onSubmitAndPrint) {
          onSubmitAndPrint();
        }
        toast.success('Receipt submitted and sent to print');
        break;
        
      case 'print_receipt':
        console.log('Printing receipt with auto-print functionality');
        // Set the flag for print redirection
        localStorage.setItem('redirectToPrint', 'true');
        localStorage.setItem('autoPrint', 'true'); // Flag for automatic printing
        
        if (onSubmitAndPrint) {
          onSubmitAndPrint();
        }
        toast.success('Receipt will be saved and automatically printed');
        return '🖨️ **Receipt Print Initiated**\n\nThe receipt is being saved and will automatically navigate to the print page with auto-print functionality.';
        break;
        
      case 'get_receipt_info':
        console.log('Getting receipt info:', args);
        const receiptInfo = {
          series: formValues?.series || 'Not set',
          receiptNo: formValues?.receiptNo || 'Auto-generated',
          amount: formValues?.amount || '0',
          discount: formValues?.discount || '0',
          narration: formValues?.narration || 'Not set',
          party: party?.label || 'Not selected',
          sm: sm?.label || 'Not selected',
          date: formValues?.date || new Date().toISOString().split('T')[0]
        };
        toast.success('Receipt information retrieved');
        return `## 📋 Current Receipt Information\n\n- **Series:** ${receiptInfo.series}\n- **Receipt No:** ${receiptInfo.receiptNo}\n- **Amount:** ₹${receiptInfo.amount}\n- **Party:** ${receiptInfo.party}\n- **SM:** ${receiptInfo.sm}\n- **Date:** ${receiptInfo.date}\n- **Narration:** ${receiptInfo.narration}`;
        
      case 'search_party':
        console.log('Searching party:', args);
        const searchTerm = args.searchTerm?.toLowerCase() || '';
        const matchingParties = partyOptions.filter(p => 
          p.label.toLowerCase().includes(searchTerm) || 
          p.value.toLowerCase().includes(searchTerm)
        );
        toast.success(`Found ${matchingParties.length} matching parties`);
        if (matchingParties.length === 0) {
          return '❌ **No matching parties found**\n\nPlease try a different search term.';
        }
        return `## 🔍 Search Results\n\n**Found ${matchingParties.length} matching parties:**\n\n${matchingParties.map((p, index) => `${index + 1}. ${p.label}`).join('\n')}`;
        
      case 'fuzzy_search_party':
        console.log('Fuzzy searching party:', args);
        const fuzzySearchTerm = args.searchTerm?.toLowerCase() || '';
        
        // Simple fuzzy search algorithm
        const fuzzyMatches = partyOptions.map(party => {
          const label = party.label.toLowerCase();
          const value = party.value.toLowerCase();
          
          // Calculate similarity score
          let score = 0;
          
          // Exact match gets highest score
          if (label === fuzzySearchTerm || value === fuzzySearchTerm) {
            score = 100;
          }
          // Starts with search term
          else if (label.startsWith(fuzzySearchTerm) || value.startsWith(fuzzySearchTerm)) {
            score = 80;
          }
          // Contains search term
          else if (label.includes(fuzzySearchTerm) || value.includes(fuzzySearchTerm)) {
            score = 60;
          }
          // Character-by-character fuzzy matching
          else {
            const labelScore = calculateFuzzyScore(label, fuzzySearchTerm);
            const valueScore = calculateFuzzyScore(value, fuzzySearchTerm);
            score = Math.max(labelScore, valueScore);
          }
          
          return { ...party, score };
        })
        .filter(party => party.score > 30) // Only include matches with score > 30
        .sort((a, b) => b.score - a.score) // Sort by score descending
        .slice(0, 10); // Limit to top 10 matches
        
        if (fuzzyMatches.length === 0) {
          toast.warning('No matching parties found');
          return '❌ **No matching parties found**\n\nPlease try a different search term or check the spelling.';
        }
        
        // Auto-select if only one match or if top match has very high confidence (score >= 85)
        if (fuzzyMatches.length === 1 || (fuzzyMatches.length > 1 && fuzzyMatches[0].score >= 85)) {
          const selectedParty = fuzzyMatches[0];
          if (onSuggestion) {
            onSuggestion('party', selectedParty.label);
          }
          toast.success(`Selected party: ${selectedParty.label}`);
          return `✅ **Auto-selected party:** ${selectedParty.label}`;
        }
        
        // Handle selection if selectOption is provided
        if (args.selectOption && args.selectOption >= 1 && args.selectOption <= fuzzyMatches.length) {
          const selectedParty = fuzzyMatches[args.selectOption - 1];
          if (onSuggestion) {
            onSuggestion('party', selectedParty.label);
          }
          toast.success(`Selected party: ${selectedParty.label}`);
          return `✅ **Selected party:** ${selectedParty.label}`;
        }
        
        // Multiple matches found, provide options
        toast.info(`Found ${fuzzyMatches.length} matching parties`);
        const optionsList = fuzzyMatches.map((party, index) => 
          `${index + 1}. **${party.label}**`
        ).join('\n');
        
        return `## 🎯 Fuzzy Search Results\n\n**Found ${fuzzyMatches.length} matching parties for "${args.searchTerm}":**\n\n${optionsList}\n\n💡 **How to select:**\n- Say "select option [number]"\n- Or use fuzzy_search_party with selectOption parameter`;
        
      case 'calculate_amount':
        console.log('Calculating amount:', args);
        let result = 0;
        switch (args.operation) {
          case 'add':
            result = args.value1 + args.value2;
            break;
          case 'subtract':
            result = args.value1 - args.value2;
            break;
          case 'multiply':
            result = args.value1 * args.value2;
            break;
          case 'divide':
            result = args.value2 !== 0 ? args.value1 / args.value2 : 0;
            break;
        }
        if (onSuggestion) {
          onSuggestion('amount', result.toString());
        }
        toast.success(`Calculation result: ₹${result.toFixed(2)}`);
        return `## 🧮 Calculation Result\n\n**${args.value1} ${args.operation} ${args.value2} = ₹${result.toFixed(2)}**\n\n*Amount has been updated in the form.*`;
        
      case 'validate_receipt':
        console.log('Validating receipt:', args);
        const validationErrors = [];
        if (!formValues?.series) validationErrors.push('Series is required');
        if (!formValues?.amount || parseFloat(formValues.amount) <= 0) validationErrors.push('Valid amount is required');
        if (!party) validationErrors.push('Party selection is required');
        if (!sm) validationErrors.push('SM selection is required');
        
        const isValid = validationErrors.length === 0;
        toast.success(isValid ? 'Receipt is valid' : 'Validation issues found');
        if (isValid) {
          return '✅ **Receipt is valid and ready to submit!**\n\nAll required fields are properly filled.';
        } else {
          return `❌ **Validation Issues Found**\n\n**Please fix the following:**\n\n${validationErrors.map(error => `- ${error}`).join('\n')}`;
        }
        
      case 'get_party_balance':
        console.log('Getting party balance:', args);
        const selectedParty = partyOptions.find(p => p.value === args.partyCode);
        if (selectedParty) {
          const balanceInfo = selectedParty.label.split(' / ')[1] || 'No balance info';
          toast.info(`Party balance: ${balanceInfo}`);
          return `## 💰 Party Balance\n\n**Party:** ${selectedParty.label.split(' / ')[0]}\n**Balance:** ${balanceInfo}`;
        } else {
          toast.warning('Party not found');
          return '❌ **Party not found in the system**\n\nPlease check the party code and try again.';
        }
        
      case 'split_amount':
        console.log('Splitting amount:', args);
        const amountToSplit = parseFloat(args.amount || formValues?.amount || '0');
        const maxAmount = parseFloat(args.maxAmount || '50000');
        if (amountToSplit <= maxAmount) {
          toast.success('No split needed');
          return `✅ **No split needed**\n\nAmount ₹${amountToSplit} is within the limit of ₹${maxAmount}.`;
        } else {
          const splits = [];
          let remaining = amountToSplit;
          while (remaining > 0) {
            const splitAmount = Math.min(remaining, maxAmount);
            splits.push(splitAmount);
            remaining -= splitAmount;
          }
          toast.success(`Amount split into ${splits.length} parts`);
          return `## 📊 Amount Split\n\n**Original Amount:** ₹${amountToSplit}\n**Split into ${splits.length} parts:**\n\n${splits.map((amount, index) => `${index + 1}. ₹${amount}`).join('\n')}\n\n*Each part is within the ₹${maxAmount} limit.*`;
        }
        
      case 'clear_form':
        console.log('Clearing form:', args);
        if (onSuggestion) {
          onSuggestion('party', '');
          onSuggestion('amount', '');
          onSuggestion('series', '');
          onSuggestion('narration', '');
          onSuggestion('discount', '');
        }
        toast.success('Form cleared successfully');
        return '🧹 **Form cleared successfully!**\n\nAll fields have been reset and you can start fresh.';
        
      case 'set_date':
        console.log('Setting date:', args);
        if (onSuggestion) {
          onSuggestion('date', args.date);
        }
        toast.success(`Date updated to ${args.date}`);
        return `📅 **Date updated successfully!**\n\nReceipt date has been set to: **${args.date}**`;
        
      case 'get_receipt_history':
        console.log('Getting receipt history:', args);
        toast.success('Receipt history retrieved (simulated)');
        return `## 📜 Receipt History\n\n**Recent Receipts:** *(Simulated data)*\n\n1. **Receipt #001** - ₹5,000 - ABC Company - ${new Date().toLocaleDateString()}\n2. **Receipt #002** - ₹3,500 - XYZ Ltd - ${new Date(Date.now() - 86400000).toLocaleDateString()}\n3. **Receipt #003** - ₹7,200 - DEF Corp - ${new Date(Date.now() - 172800000).toLocaleDateString()}\n\n*This is simulated data. In production, this would show actual receipt history from the database.*`;
        
      default:
        console.log('Unknown function call:', name, args);
        toast.error('Unknown function called');
        return 'Unknown function called';
    }
  };

  const handleSendMessage = async (messageText?: string) => {
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
    setInputText('');

    const aiResponseText = await getGeminiResponse(textToSend);

    const aiResponse: Message = {
      id: (Date.now() + 1).toString(),
      text: aiResponseText,
      isUser: false,
      timestamp: new Date(),
      language: currentLanguage
    };
    setMessages(prev => [...prev, aiResponse]);
  };

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
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
                </h3>
                <p className="text-xs opacity-90">Cash Receipt Assistant</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
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
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {message.isUser ? (
                    <p className="text-sm whitespace-pre-line">{message.text}</p>
                  ) : (
                    <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          code: ({ children }) => <code className="bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded text-xs">{children}</code>,
                          pre: ({ children }) => <pre className="bg-gray-200 dark:bg-gray-600 p-2 rounded text-xs overflow-x-auto">{children}</pre>,
                          h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
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
                placeholder={'Ask me anything...'}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
              />
              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={!inputText.trim()}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white disabled:text-gray-500 dark:disabled:text-gray-400 p-2 rounded-lg transition-colors"
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

export default SarthakAssistant;