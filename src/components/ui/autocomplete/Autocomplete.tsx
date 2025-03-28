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
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    } else {
      setFilteredOptions([]);
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
  };

  const handleFocus = () => {
    setIsActive(true);
  };

  const handleBlur = () => {
    // Delay hiding the dropdown to allow for option clicks
    setTimeout(() => {
      setIsActive(false);
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
        autoComplete={autoComplete}
        disabled={typeof disabled === 'boolean' ? disabled : Boolean(disabled)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={label}
      />
      {isActive && filteredOptions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredOptions.map((option, index) => (
            <div
              key={index}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100"
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