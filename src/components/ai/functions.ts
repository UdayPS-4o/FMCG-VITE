import { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { toast } from 'react-toastify';

// Define types for component props that are passed to the service
interface SarthakAIAssistantProps {
  onSuggestion?: (field: string, value: string) => void;
  onSubmitAndPrint?: () => void;
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

// Helper function to calculate fuzzy matching score
const calculateFuzzyScore = (text: string, searchTerm: string): number => {
  if (!text || !searchTerm) return 0;

  // Convert to lowercase for case-insensitive matching
  const lowerText = text.toLowerCase();
  const lowerSearchTerm = searchTerm.toLowerCase();

  let score = 0;
  let searchIndex = 0;

  // Exact match gets highest score
  if (lowerText === lowerSearchTerm) {
    return 1000;
  }

  // Check if search term is at the beginning (common for names)
  if (lowerText.startsWith(lowerSearchTerm)) {
    score += 500;
  }

  // Check if search term is contained anywhere
  if (lowerText.includes(lowerSearchTerm)) {
    score += 300;
  }

  // Enhanced fuzzy matching for voice input tolerance
  // Check for partial word matches
  const textWords = lowerText.split(/\s+/);
  const searchWords = lowerSearchTerm.split(/\s+/);
  
  for (const searchWord of searchWords) {
    for (const textWord of textWords) {
      if (textWord.startsWith(searchWord)) {
        score += 100;
      }
      if (textWord.includes(searchWord) && searchWord.length >= 3) {
        score += 50;
      }
      // Phonetic similarity for common voice recognition errors
      if (arePhoneticallySimilar(textWord, searchWord)) {
        score += 75;
      }
    }
  }

  // Character-by-character matching (original logic)
  for (let i = 0; i < lowerText.length && searchIndex < lowerSearchTerm.length; i++) {
    if (lowerText[i] === lowerSearchTerm[searchIndex]) {
      score += 10;
      searchIndex++;
    }
  }

  // Bonus for completing the search term
  if (searchIndex === lowerSearchTerm.length) {
    score += 50;
  }

  // Less penalty for length difference (names can vary in length)
  const lengthDiff = Math.abs(lowerText.length - lowerSearchTerm.length);
  score -= lengthDiff * 0.5; // Reduced penalty for voice input tolerance

  return Math.max(0, score);
};

// Helper function to check phonetic similarity for common voice recognition errors
const arePhoneticallySimilar = (word1: string, word2: string): boolean => {
  if (!word1 || !word2 || Math.abs(word1.length - word2.length) > 2) return false;
  
  // Common phonetic substitutions in voice recognition
  const phoneticMap: { [key: string]: string[] } = {
    'c': ['k', 's'],
    'k': ['c'],
    's': ['c', 'z'],
    'z': ['s'],
    'f': ['ph', 'v'],
    'v': ['f', 'w'],
    'w': ['v'],
    'i': ['e'],
    'e': ['i'],
    'o': ['u'],
    'u': ['o'],
    'th': ['t'],
    't': ['th'],
    'sh': ['s'],
    'ch': ['c']
  };
  
  let differences = 0;
  const maxLen = Math.max(word1.length, word2.length);
  
  for (let i = 0; i < maxLen; i++) {
    const char1 = word1[i] || '';
    const char2 = word2[i] || '';
    
    if (char1 !== char2) {
      const similar = phoneticMap[char1]?.includes(char2) || phoneticMap[char2]?.includes(char1);
      if (!similar) {
        differences++;
      }
    }
  }
  
  return differences <= 2; // Allow up to 2 phonetic differences
};

// Function Declarations
export const updateFormFieldsDeclaration: FunctionDeclaration = {
    name: 'update_form_fields',
    description: 'Updates one or more fields on the receipt form. Use this to create a new receipt, update fields, or clear fields by providing an empty string for the value.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        updates: {
          type: SchemaType.ARRAY,
          description: 'An array of field-value pairs to update.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              field: { type: SchemaType.STRING, description: 'The name of the field to update (e.g., party, amount, series, narration, date, discount).' },
              value: { type: SchemaType.STRING, description: 'The new value for the field.' }
            },
            required: ['field', 'value']
          }
        }
      },
      required: ['updates']
    }
  };

export const calculateAmountDeclaration: FunctionDeclaration = {
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

export const validateReceiptDeclaration: FunctionDeclaration = {
  name: 'validate_receipt',
  description: 'Validates the current receipt form for completeness and correctness.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}
  }
};

export const getPartyBalanceDeclaration: FunctionDeclaration = {
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

export const splitAmountDeclaration: FunctionDeclaration = {
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

export const getReceiptHistoryDeclaration: FunctionDeclaration = {
  name: 'get_receipt_history',
  description: 'Gets recent receipt history for reference.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      limit: { type: SchemaType.NUMBER, description: 'Number of recent receipts to fetch (default 10).' }
    }
  }
};

export const fuzzySearchPartyDeclaration: FunctionDeclaration = {
  name: 'fuzzy_search_party',
  description: 'Performs fuzzy search for party names and provides multiple options if more than one match is found.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      searchTerm: { type: SchemaType.STRING, description: 'The name or partial name to search for. Party names are in English (Latin script). The user may speak the name in Hindi (Devanagari script). If the user provides a name in Hindi, transliterate it to English before calling the function. For example, if the user says "सुरेश", the searchTerm should be "Suresh".' },
      selectOption: { type: SchemaType.NUMBER, description: 'Option number to select from search results (1-based index).' }
    },
    required: ['searchTerm']
  }
};

export const printReceiptDeclaration: FunctionDeclaration = {
  name: 'print_receipt',
  description: 'Saves the current receipt and automatically prints it using the default printer.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}
  }
};

export const functionDeclarations = [
  updateFormFieldsDeclaration,
  printReceiptDeclaration,
  fuzzySearchPartyDeclaration,
  calculateAmountDeclaration,
  // validateReceiptDeclaration,
  getPartyBalanceDeclaration,
  splitAmountDeclaration,
  getReceiptHistoryDeclaration
];

async function handlePrintCall(props: SarthakAIAssistantProps){
  const { onSubmitAndPrint, formValues, party, sm, partyOptions } = props;
  console.log('handlePrintCall: Printing receipt');
  
  // Set the redirectToPrint flag first, just like the Save & Print button does
  localStorage.setItem('redirectToPrint', 'true');
  localStorage.setItem('autoPrint', 'true');
  console.log("will print in 1 seconds")
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Now call the submit function
  // if (onSubmitAndPrint) {
  //   onSubmitAndPrint();
  // }
  // execute JS CODE document.querySelector('.flex > [type="button"].bg-green-600').click()
  try{
    console.log('searching-print button')
    localStorage.setItem('autoPrint', 'true');
    const printButton = document.querySelector('#autoprint') as HTMLElement;
    if (printButton) {
      printButton.click();
    } else {
      console.warn('Print button not found');
    }
  }catch(e){
    console.error("Error clicking print button: ", e);
  }
  
  toast.success('Receipt will be saved and automatically printed');
}

export const handleFunctionCall = async (functionCall: any, props: SarthakAIAssistantProps): Promise<{ name: string, response: object }> => {
  const { name, args } = functionCall;
  const { onSuggestion, onSubmitAndPrint, formValues, party, sm, partyOptions } = props;

  console.log('=== FUNCTION CALL DEBUG ===');
  console.log('Function name:', name);
  console.log('Function args:', JSON.stringify(args, null, 2));
  console.log('partyOptions available:', partyOptions?.length || 0);
  console.log('=== END FUNCTION CALL DEBUG ===');
  
  // Special handling for fuzzy_search_party when party options are not loaded
  if (name === 'fuzzy_search_party' && (!partyOptions || partyOptions.length === 0)) {
    console.log('⚠️ Party options not available for fuzzy search, returning error...');
    return {
      name,
      response: {
        executed: false,
        error: 'Party options are still loading. Please wait a moment and try again.',
        message: '⏳ **Party data is loading...**\n\nPlease wait a moment for the party list to load, then try your search again.',
        currentFormState: {
          party: party?.label || 'Not selected',
          amount: formValues?.amount || 'Empty',
          series: formValues?.series || 'Empty',
          receiptNo: formValues?.receiptNo || 'Empty',
          narration: formValues?.narration || 'Empty',
          date: formValues?.date || 'Empty',
          discount: formValues?.discount || 'Empty',
          sm: sm?.label || 'Not selected'
        }
      }
    };
  }

  let functionResult = {
    executed: true,
    message: '',
    error: null as string | null,
  };

  try {
    switch (name) {
      case 'update_form_fields':
        console.log('Updating receipt fields:', args);
        if (args.updates && Array.isArray(args.updates)) {
          args.updates.forEach((update: { field: string, value: any }) => {
            onSuggestion?.(update.field, update.value.toString());
          });
          functionResult.message = `Updated ${args.updates.length} field(s).`;
          toast.success(functionResult.message);
        } else {
          functionResult.executed = false;
          functionResult.error = 'Invalid arguments: "updates" is not an array.';
          functionResult.message = 'No fields were updated. Invalid arguments received.';
          toast.warn(functionResult.message);
        }
        break;

      case 'print_receipt':
        console.log('Printing receipt with auto-print functionality');
        await handlePrintCall(props);
        functionResult.message = '🖨️ **Receipt Print Initiated**\n\nThe receipt is being saved and will automatically navigate to the print page with auto-print functionality.';
        break;

      case 'fuzzy_search_party':
        console.log('Fuzzy searching party:', args);
        console.log('Available partyOptions:', partyOptions?.length || 0, 'parties');
        console.log('First few parties:', partyOptions?.slice(0, 5).map(p => p.label));
        
        // Enhanced debugging for voice input issues
        console.log('=== FUZZY SEARCH DEBUG ===');
        console.log('Raw searchTerm:', JSON.stringify(args.searchTerm));
        console.log('SearchTerm type:', typeof args.searchTerm);
        console.log('SearchTerm length:', args.searchTerm?.length);
        console.log('SearchTerm char codes:', args.searchTerm?.split('').map(c => c.charCodeAt(0)));
        
        // Clean the search term more aggressively for voice input
        let cleanedSearchTerm = (args.searchTerm || '')
          .trim() // Remove leading/trailing whitespace
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/[^\w\s\u0900-\u097F]/g, '') // Keep only word characters, spaces, and Hindi characters
          .toLowerCase();
        
        console.log('Cleaned search term:', JSON.stringify(cleanedSearchTerm));
        console.log('Cleaned term length:', cleanedSearchTerm.length);
        console.log('=== END FUZZY SEARCH DEBUG ===');
        
        const fuzzySearchTerm = cleanedSearchTerm;
        
        const fuzzyMatches = (partyOptions ?? []).map(p => {
          const label = p.label.toLowerCase();
          const value = p.value.toLowerCase();
          let score = calculateFuzzyScore(label, fuzzySearchTerm);
          if (value) {
              score = Math.max(score, calculateFuzzyScore(value, fuzzySearchTerm));
          }
          
          // Enhanced scoring for better matches
          // Check if search term is contained in label or value
          if (label.includes(fuzzySearchTerm)) {
            score += 50;
          }
          if (value.includes(fuzzySearchTerm)) {
            score += 50;
          }
          
          // Check for word boundaries (better for names)
          const labelWords = label.split(/\s+/);
          const valueWords = value.split(/\s+/);
          
          for (const word of labelWords) {
            if (word.startsWith(fuzzySearchTerm)) {
              score += 30;
            }
            if (word === fuzzySearchTerm) {
              score += 60;
            }
          }
          
          for (const word of valueWords) {
            if (word.startsWith(fuzzySearchTerm)) {
              score += 30;
            }
            if (word === fuzzySearchTerm) {
              score += 60;
            }
          }
          
          console.log(`Party: ${p.label}, Score: ${score}`);
          return { ...p, score };
        })
        .filter(p => p.score > 10) // Lower threshold for better recall (lowered for voice input tolerance)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
        
        console.log('Fuzzy matches found:', fuzzyMatches.length);
        console.log('Top matches:', fuzzyMatches.slice(0, 3).map(m => ({ label: m.label, score: m.score })));

        if (fuzzyMatches.length === 0) {
          toast.warning('No matching parties found');
          functionResult.executed = false;
          functionResult.error = 'No matching parties found for the given search term.';
          functionResult.message = '❌ **No matching parties found**\n\nPlease try a different search term or check the spelling.';
        } else if (fuzzyMatches.length === 1 || (fuzzyMatches.length > 1 && fuzzyMatches[0].score >= 90)) {
          const selectedParty = fuzzyMatches[0];
          onSuggestion?.('party', selectedParty.label);
          toast.success(`Selected party: ${selectedParty.label}`);
          functionResult.message = `✅ **Auto-selected party:** ${selectedParty.label}`;
        } else {
          toast.info(`Found ${fuzzyMatches.length} matching parties`);
          const optionsList = fuzzyMatches.map((p, index) => `${index + 1}. **${p.label}**`).join('\n');
          functionResult.message = `## 🎯 Fuzzy Search Results\n\n**Found ${fuzzyMatches.length} matching parties for "${args.searchTerm}":**\n\n${optionsList}\n\n💡 **How to select:**\n- Say "select option [number]"\n- Or use fuzzy_search_party with selectOption parameter`;
        }
        break;

      case 'calculate_amount':
        console.log('Calculating amount:', args);
        let result = 0;
        switch (args.operation) {
          case 'add': result = args.value1 + args.value2; break;
          case 'subtract': result = args.value1 - args.value2; break;
          case 'multiply': result = args.value1 * args.value2; break;
          case 'divide': result = args.value2 !== 0 ? args.value1 / args.value2 : 0; break;
        }
        onSuggestion?.('amount', result.toString());
        toast.success(`Calculation result: ₹${result.toFixed(2)}`);
        functionResult.message = `## 🧮 Calculation Result\n\n**${args.value1} ${args.operation} ${args.value2} = ₹${result.toFixed(2)}**\n\n*Amount has been updated in the form.*`;
        break;

      case 'validate_receipt':
        console.log('=== VALIDATION DEBUG START ===');
        console.log('Validating receipt:', args);
        console.log('Raw formValues received:', JSON.stringify(formValues, null, 2));
        console.log('Raw party received:', JSON.stringify(party, null, 2));
        console.log('Raw sm received:', JSON.stringify(sm, null, 2));
        console.log('Raw partyOptions length:', partyOptions?.length || 0);
        
        const validationErrors = [];
        const currentFormState = {
          party: party?.label || 'Not selected',
          amount: formValues?.amount || 'Empty',
          series: formValues?.series || 'Empty',
          receiptNo: formValues?.receiptNo || 'Empty',
          narration: formValues?.narration || 'Empty',
          date: formValues?.date || 'Empty',
          discount: formValues?.discount || 'Empty',
          sm: sm?.label || 'Not selected'
        };
        
        // Debug: Show what we're validating
        console.log('Form state being validated:', JSON.stringify(currentFormState, null, 2));
        console.log('=== VALIDATION DEBUG END ===');
        
        // Validation logic
        if (!formValues?.series || formValues.series.trim() === '') {
          validationErrors.push('Series is required');
        }
        if (!formValues?.amount || formValues.amount.trim() === '' || parseFloat(formValues.amount) <= 0) {
          validationErrors.push('Valid amount is required');
        }
        if (!party || !party.label) {
          validationErrors.push('Party selection is required');
        }
        if (!sm || !sm.label) {
          validationErrors.push('SM selection is required');
        }
        if (!formValues?.date || formValues.date.trim() === '') {
          validationErrors.push('Date is required');
        }

        const isValid = validationErrors.length === 0;
        toast.success(isValid ? 'Receipt is valid' : 'Validation issues found');
        
        if (isValid) {
          functionResult.message = '✅ **Receipt is valid and ready to submit!**\n\nAll required fields are properly filled.\n\n**Current Form State:**\n' + 
            Object.entries(currentFormState).map(([key, value]) => `- **${key}**: ${value}`).join('\n');
        } else {
          functionResult.executed = false;
          functionResult.error = `Validation failed: ${validationErrors.join(', ')}`;
          functionResult.message = `❌ **Validation Issues Found**\n\n**Please fix the following:**\n\n${validationErrors.map(error => `- ${error}`).join('\n')}\n\n**Current Form State:**\n` + 
            Object.entries(currentFormState).map(([key, value]) => `- **${key}**: ${value}`).join('\n') + 
            '\n\n**Raw Data Received:**\n' +
            `- formValues: ${JSON.stringify(formValues)}\n` +
            `- party: ${JSON.stringify(party)}\n` +
            `- sm: ${JSON.stringify(sm)}`;
        }
        break;

      case 'get_party_balance':
        console.log('Getting party balance:', args);
        const selectedParty = (partyOptions ?? []).find(p => p.value === args.partyCode);
        if (selectedParty) {
          const balanceInfo = selectedParty.label.split(' / ')[1] || 'No balance info';
          toast.info(`Party balance: ${balanceInfo}`);
          functionResult.message = `## 💰 Party Balance\n\n**Party:** ${selectedParty.label.split(' / ')[0]}\n**Balance:** ${balanceInfo}`;
        } else {
          toast.warning('Party not found');
          functionResult.executed = false;
          functionResult.error = `Party with code ${args.partyCode} not found.`;
          functionResult.message = '❌ **Party not found in the system**\n\nPlease check the party code and try again.';
        }
        break;

      case 'split_amount':
        console.log('Splitting amount:', args);
        const amountToSplit = parseFloat(args.amount || formValues?.amount || '0');
        const maxAmount = parseFloat(args.maxAmount || '50000');
        if (amountToSplit <= maxAmount) {
          toast.success('No split needed');
          functionResult.message = `✅ **No split needed**\n\nAmount ₹${amountToSplit} is within the limit of ₹${maxAmount}.`;
        } else {
          const splits = [];
          let remaining = amountToSplit;
          while (remaining > 0) {
            const splitAmount = Math.min(remaining, maxAmount);
            splits.push(splitAmount);
            remaining -= splitAmount;
          }
          toast.success(`Amount split into ${splits.length} parts`);
          functionResult.message = `## 📊 Amount Split\n\n**Original Amount:** ₹${amountToSplit}\n**Split into ${splits.length} parts:**\n\n${splits.map((amount, index) => `${index + 1}. ₹${amount}`).join('\n')}\n\n*Each part is within the ₹${maxAmount} limit.*`;
        }
        break;
        
      case 'get_receipt_history':
        console.log('Getting receipt history:', args);
        toast.success('Receipt history retrieved (simulated)');
        functionResult.message = `## 📜 Receipt History\n\n**Recent Receipts:** *(Simulated data)*\n\n1. **Receipt #001** - ₹5,000 - ABC Company - ${new Date().toLocaleDateString()}\n2. **Receipt #002** - ₹3,500 - XYZ Ltd - ${new Date(Date.now() - 86400000).toLocaleDateString()}\n3. **Receipt #003** - ₹7,200 - DEF Corp - ${new Date(Date.now() - 172800000).toLocaleDateString()}\n\n*This is simulated data. In production, this would show actual receipt history from the database.*`;
        break;

      default:
        console.log('Unknown function call:', name, args);
        toast.error('Unknown function called');
        functionResult.executed = false;
        functionResult.error = `The function "${name}" does not exist.`;
        functionResult.message = 'Unknown function called';
    }
  } catch (e: any) {
    console.error(`Error executing function ${name}:`, e);
    toast.error(`An unexpected error occurred in function ${name}.`);
    functionResult.executed = false;
    functionResult.error = e.message || `An unexpected error occurred while executing ${name}.`;
    functionResult.message = `❌ An unexpected error occurred while trying to perform the action.`;
  }
  
  // Include current form state in response for debugging
  const currentFormState = {
    party: party?.label || 'Not selected',
    amount: formValues?.amount || 'Empty',
    series: formValues?.series || 'Empty',
    receiptNo: formValues?.receiptNo || 'Empty',
    narration: formValues?.narration || 'Empty',
    date: formValues?.date || 'Empty',
    discount: formValues?.discount || 'Empty',
    sm: sm?.label || 'Not selected'
  };

  return {
    name,
    response: {
      ...functionResult,
      currentFormState
    }
  };
};
