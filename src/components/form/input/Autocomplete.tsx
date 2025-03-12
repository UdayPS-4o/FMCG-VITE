import { useState, useRef, useEffect } from "react";

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
  autoComplete?: string;
}

// Add CSS styles as a separate string
const customScrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 20px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }
  .dark .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(75, 85, 99, 0.5);
  }
  .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(75, 85, 99, 0.7);
  }
`;

const Autocomplete: React.FC<AutocompleteProps> = ({
  id,
  label,
  options,
  onChange,
  className = "",
  defaultValue = "",
  autoComplete = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const isActive = isFocused || searchTerm;

  // Set initial selected option based on defaultValue
  useEffect(() => {
    if (defaultValue) {
      const option = options.find(opt => opt.value === defaultValue);
      if (option) {
        setSelectedOption(option);
        setSearchTerm(option.label);
      }
    }
  }, [defaultValue, options]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
    
    // If search term is empty, clear selection
    if (e.target.value === "") {
      setSelectedOption(null);
      onChange("");
    }
  };

  const handleOptionSelect = (option: Option) => {
    setSelectedOption(option);
    setSearchTerm(option.label);
    setIsOpen(false);
    onChange(option.value);
  };

  return (
    <div 
      className={`relative border ${isActive ? 'border-brand-500 dark:border-brand-400' : 'border-gray-300 dark:border-gray-700'} rounded-lg transition-all duration-200 ${className}`} 
      ref={dropdownRef}
    >
      <div className="relative">
        <input
          id={id}
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
          autoComplete={autoComplete}
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
      
      {/* Dropdown menu */}
      {isOpen && (
        <div className="fixed z-50 mt-1 w-full max-h-60 overflow-auto rounded-md bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 custom-scrollbar" style={{
          width: dropdownRef.current?.offsetWidth + 'px',
          left: dropdownRef.current?.getBoundingClientRect().left + 'px',
          top: (dropdownRef.current?.getBoundingClientRect().bottom || 0) + 5 + 'px',
          overflowY: 'auto'
        }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                className={`px-4 py-2.5 text-sm cursor-pointer text-gray-700 dark:text-gray-200 transition-colors duration-150 hover:bg-gray-200/90 dark:hover:bg-gray-700/90 ${
                  selectedOption?.value === option.value 
                    ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400' 
                    : ''
                }`}
                onClick={() => handleOptionSelect(option)}
              >
                {option.label}
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              No options found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Autocomplete; 