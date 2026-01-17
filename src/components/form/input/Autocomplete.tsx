import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";

interface Option {
  value: string;
  label: string;
}

interface AutocompleteProps {
  id: string;
  label: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
  defaultValue?: string;
  value?: string;
  inputValue?: string;
  autoComplete?: string;
  disabled?: boolean | object;
  onEnter?: () => void;
  onInputChange?: (value: string) => void;
}

// Define handle types for the ref
export interface AutocompleteRefHandle {
  focus: () => void;
}

const customScrollbarStyles = `
  .dropdown-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .dropdown-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .dropdown-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 20px;
  }
  .dropdown-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }
  .dark .dropdown-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(75, 85, 99, 0.5);
  }
  .dark .dropdown-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(75, 85, 99, 0.7);
  }
  
  .autocomplete-dropdown {
    position: absolute;
    z-index: 9000;
    max-height: 240px;
    overflow-y: auto;
    width: var(--dropdown-width);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--color-gray-200);
    background-color: white;
    margin-top: 4px;
  }
  
  .dark .autocomplete-dropdown {
    background-color: var(--color-gray-800);
    border-color: var(--color-gray-700);
  }
  
  .dropdown-container {
    position: absolute;
    z-index: 9000;
    width: 100%;
    left: 0;
    top: 100%;
  }
`;

const Autocomplete = forwardRef<AutocompleteRefHandle, AutocompleteProps>(({
  id,
  label,
  options,
  onChange,
  className = "",
  defaultValue = "",
  value,
  inputValue = "",
  autoComplete = "",
  disabled = false,
  onEnter,
  onInputChange,
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Expose focus method via the ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    }
  }));

  const isActive = isFocused || searchTerm;

  // Filter options based on search term
  const filteredOptions = options.filter(option => {
    if (!option || !option.label) {
      return false;
    }
    const labelLower = option.label.toLowerCase();
    const searchTermsLower = (searchTerm || '').toLowerCase();
    const searchWords = searchTermsLower.split(' ').filter(word => word.length > 0);
    
    // If no search words, show all options (or handle as needed)
    if (searchWords.length === 0 && !value) {
      return true;
    }
    if (searchWords.length === 0 && value && selectedOption?.label === searchTerm) {
        return option.value === value;
    }
    
    // Check if all search words are included in the label
    return searchWords.every(word => labelLower.includes(word));
  });

  // Reset highlighted index when search term changes or dropdown opens/closes
  useEffect(() => {
    setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
  }, [searchTerm, isOpen, filteredOptions.length]);

  // Scroll to highlighted item
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const optionElement = dropdownRef.current.children[highlightedIndex] as HTMLElement;
      if (optionElement) {
        optionElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Set initial selected option based on defaultValue or value
  useEffect(() => {
    if (value !== undefined) {
      const option = options.find(opt => opt.value === value);
      if (option) {
        setSelectedOption(option);
        setSearchTerm(option.label);
      } else {
        setSelectedOption(null);
        setSearchTerm(inputValue || "");
      }
    } else if (defaultValue) {
      const option = options.find(opt => opt.value === defaultValue);
      if (option) {
        setSelectedOption(option);
        setSearchTerm(option.label);
      }
    } else if (inputValue) {
      setSearchTerm(inputValue);
    }
  }, [defaultValue, value, options, inputValue]);

  useEffect(() => {
    if (value === undefined && inputValue !== undefined && inputValue !== searchTerm) {
      setSearchTerm(inputValue);
    }
  }, [inputValue, value]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputContainerRef.current && 
        !inputContainerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        if (searchTerm && !selectedOption && !options.some(opt => opt.label === searchTerm)) {
          setSearchTerm("");
          onChange("");
        } else if (selectedOption && searchTerm !== selectedOption.label) {
          setSearchTerm(selectedOption.label);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Calculate dropdown position
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Detect dark mode
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Check for dark mode on mount and when theme changes
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    // Initial check
    checkDarkMode();
    
    // Create an observer to watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });
    
    return () => observer.disconnect();
  }, []);

  // Update dropdown position when input container changes or dropdown opens
  useEffect(() => {
    if (isOpen && inputContainerRef.current) {
      const rect = inputContainerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen, searchTerm]);

  // Add the custom scrollbar styles to the document
  useEffect(() => {
    // Create style element
    const styleElement = document.createElement('style');
    styleElement.textContent = customScrollbarStyles;
    document.head.appendChild(styleElement);

    // Clean up
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setSearchTerm(newVal);
    setIsOpen(true);
    if (onInputChange) {
      onInputChange(newVal);
    }
    
    // If search term is empty, clear selection
    if (newVal === "") {
      setSelectedOption(null);
      onChange("");
    }
  };

  const handleOptionSelect = (option: Option) => {
    setSelectedOption(option);
    setSearchTerm(option.label);
    setIsOpen(false);
    onChange(option.value);
    if (onEnter) {
      onEnter();
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleOptionSelect(filteredOptions[highlightedIndex]);
        }
        if (onEnter) {
          onEnter();
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        if (selectedOption) {
          setSearchTerm(selectedOption.label);
        }
      }
    } else if (e.key === 'Enter' && !isOpen) {
      if (onEnter) {
        const exactMatch = options.find(opt => opt.label.toLowerCase() === searchTerm.toLowerCase() || opt.value.toLowerCase() === searchTerm.toLowerCase());
        if (exactMatch && (!selectedOption || selectedOption.value !== exactMatch.value)) {
          handleOptionSelect(exactMatch);
        }
        onEnter();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!isOpen && searchTerm) {
            setIsOpen(true);
        } else if (!isOpen && !searchTerm && options.length > 0){
            setIsOpen(true);
        }
    }

    if (e.key === 'Tab' && isOpen) {
      setIsOpen(false);
      if (selectedOption) {
        setSearchTerm(selectedOption.label);
      } else if (searchTerm && !filteredOptions.some(opt => opt.label === searchTerm)) {
      }
    }
  };

  // Format option label - if it contains a pipe (|), make the first part bold
  const formatOptionLabel = (label: string) => {
    if (label.includes('|')) {
      const parts = label.split('|');
      return (
        <div className="flex flex-col">
          <span className="font-semibold text-brand-600 dark:text-brand-400">{parts[0].trim()}</span>
          <span className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-1">{parts[1].trim()}</span>
        </div>
      );
    }
    return label;
  };

  return (
    <div 
      className={`relative border ${isActive ? 'border-brand-500 dark:border-brand-400' : 'border-gray-300 dark:border-gray-700'} rounded-lg transition-all duration-200 ${className}`} 
      ref={inputContainerRef}
    >
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type="text"
          className="w-full px-4 py-2.5 text-sm bg-transparent text-gray-800 dark:text-white/90 focus:outline-none pr-16"
          placeholder=" "
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
          }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          autoComplete={autoComplete}
          disabled={Boolean(disabled)}
        />
        
        {/* Clear button */}
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedOption(null);
              onChange('');
              setIsOpen(false);
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
            title="Clear"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
        
        {/* Dropdown arrow */}
        <div 
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-500 dark:text-gray-400"
          onClick={() => setIsOpen(!isOpen)}
        >
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 16 16" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          >
            <path 
              d="M4 6L8 10L12 6" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      
      <label 
        htmlFor={id} 
        className={`absolute transition-all duration-200 pointer-events-none ${
          isActive 
            ? 'text-xs -top-2 left-2 px-1 text-brand-500 dark:text-brand-400 bg-white dark:bg-gray-900' 
            : 'text-gray-500 dark:text-gray-400 top-1/2 -translate-y-1/2 left-4'
        }`}
      >
        {label}
      </label>
      
      {/* Render dropdown using portal to avoid clipping */}
      {isOpen && createPortal(
        <div 
          ref={dropdownRef} 
          className="autocomplete-dropdown dropdown-scrollbar"
          style={{
            position: 'absolute',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            zIndex: 9000,
            maxHeight: '240px',
            overflowY: 'auto',
            borderRadius: '8px',
            boxShadow: isDarkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 4px 20px rgba(0, 0, 0, 0.2)',
            border: isDarkMode ? '1px solid #374151' : '1px solid #E5E7EB',
            backgroundColor: isDarkMode ? '#1F2937' : 'white',
            marginTop: '4px'
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <div
                key={option.value}
                className={`px-4 py-3 text-sm cursor-pointer text-gray-700 dark:text-gray-200 transition-colors duration-150 hover:bg-brand-50 dark:hover:bg-brand-900/10 ${
                  selectedOption?.value === option.value
                    ? 'bg-brand-100 dark:bg-brand-900/20'
                    : ''
                } ${
                  highlightedIndex === index
                    ? 'bg-brand-200 dark:bg-brand-700 ring-2 ring-brand-500' 
                    : ''
                }`}
                onClick={() => handleOptionSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {formatOptionLabel(option.label)}
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              No options found
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
});

export default Autocomplete; 
