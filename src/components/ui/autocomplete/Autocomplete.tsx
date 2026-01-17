import React, { useState, useRef, useEffect } from 'react';

// Define Option type properly
export interface Option {
  value: string;
  label: string;
  [key: string]: any; // Allow for additional properties
}

export interface AutocompleteProps {
  id: string;
  label: string;
  options: Option[];
  onChange: (value: string) => void;
  defaultValue?: string;
  autoComplete?: string;
  disabled?: boolean | any; // Using 'any' to accommodate the complex user.subgroup object
}

const Autocomplete: React.FC<AutocompleteProps> = ({
  id,
  label,
  options,
  onChange,
  defaultValue = "",
  autoComplete = "off",
  disabled = false
}) => {
  const [inputValue, setInputValue] = useState(defaultValue);
  const [isActive, setIsActive] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<Option[]>([]);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Update input value when defaultValue changes
    if (defaultValue !== inputValue) {
      setInputValue(defaultValue);
    }
  }, [defaultValue]);

  useEffect(() => {
    // Filter options based on input value
    if (inputValue) {
      const filtered = options.filter(option =>
        option.label.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredOptions(filtered);
      setActiveOptionIndex(-1); // Reset active index when options change
    } else {
      setFilteredOptions([]);
      setActiveOptionIndex(-1);
    }
  }, [inputValue, options]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    if (!value) {
      onChange('');
    }
  };

  const handleOptionClick = (option: Option) => {
    setInputValue(option.label);
    onChange(option.value);
    setIsActive(false);
    setActiveOptionIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isActive || filteredOptions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveOptionIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveOptionIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        if (activeOptionIndex >= 0 && activeOptionIndex < filteredOptions.length) {
          e.preventDefault();
          handleOptionClick(filteredOptions[activeOptionIndex]);
        }
        break;
      case 'Escape':
        setIsActive(false);
        setActiveOptionIndex(-1);
        break;
    }
  };

  // Scroll active option into view
  useEffect(() => {
    if (isActive && activeOptionIndex >= 0 && optionsListRef.current) {
      const activeOption = optionsListRef.current.children[activeOptionIndex] as HTMLElement;
      if (activeOption) {
        activeOption.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [activeOptionIndex, isActive]);

  const handleFocus = () => {
    setIsActive(true);
  };

  const handleBlur = () => {
    // Delay hiding the dropdown to allow for option clicks
    setTimeout(() => {
      setIsActive(false);
      setActiveOptionIndex(-1);
    }, 200);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete={autoComplete}
        disabled={typeof disabled === 'boolean' ? disabled : Boolean(disabled)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={label}
      />
      {isActive && filteredOptions.length > 0 && (
        <div 
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
          ref={optionsListRef}
        >
          {filteredOptions.map((option, index) => (
            <div
              key={index}
              className={`px-3 py-2 cursor-pointer ${
                index === activeOptionIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
              onClick={() => handleOptionClick(option)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Autocomplete; 