import type React from "react";
import { useState, useEffect, useRef } from "react";

interface Option {
  value: string;
  text: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  defaultSelected?: string[];
  value?: string[];
  onChange?: (selected: string[]) => void;
  disabled?: boolean;
  allowFiltering?: boolean;
  selectOnEnter?: boolean;
  matchThreshold?: number;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  options,
  defaultSelected = [],
  value,
  onChange,
  disabled = false,
  allowFiltering = false,
  selectOnEnter = false,
  matchThreshold = 3,
}) => {
  const [selectedOptions, setSelectedOptions] =
    useState<string[]>(defaultSelected);
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update internal state when value prop changes (controlled component)
  useEffect(() => {
    if (value !== undefined) {
      setSelectedOptions(value);
    }
  }, [value]);

  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
      // Reset filter when opening dropdown
      if (!isOpen) setFilterText("");
    }
  };

  const handleSelect = (optionValue: string) => {
    const newSelectedOptions = selectedOptions.includes(optionValue)
      ? selectedOptions.filter((val) => val !== optionValue)
      : [...selectedOptions, optionValue];

    // If component is controlled, only call onChange
    if (value !== undefined) {
      onChange?.(newSelectedOptions);
    } else {
      // If uncontrolled, update internal state and call onChange
      setSelectedOptions(newSelectedOptions);
      onChange?.(newSelectedOptions);
    }
    setFilterText("");
  };

  const removeOption = (optionValue: string) => {
    const newSelectedOptions = selectedOptions.filter((opt) => opt !== optionValue);
    
    // If component is controlled, only call onChange
    if (value !== undefined) {
      onChange?.(newSelectedOptions);
    } else {
      // If uncontrolled, update internal state and call onChange
      setSelectedOptions(newSelectedOptions);
      onChange?.(newSelectedOptions);
    }
  };

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFilterText("");
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard events for filtering and selection
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'Enter' && selectOnEnter && filterText.length >= matchThreshold && filteredOptions.length > 0) {
      // Get the first option that starts with the filter text
      const firstMatch = filteredOptions.find(
        option => option.text.toLowerCase().startsWith(filterText.toLowerCase())
      );
      
      if (firstMatch) {
        handleSelect(firstMatch.value);
        e.preventDefault();
      }
    }
  };

  const selectedValuesText = selectedOptions.map(
    (value) => options.find((option) => option.value === value)?.text || ""
  );

  // Filter options based on input text and remove already selected ones
  const filteredOptions = options.filter(
    option => 
      !selectedOptions.includes(option.value) && 
      (!filterText || option.text.toLowerCase().includes(filterText.toLowerCase()))
  );

  return (
    <div className="w-full">
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        {label}
      </label>

      <div className="relative inline-block w-full" ref={dropdownRef}>
        <div className="relative">
          <div onClick={toggleDropdown} className="w-full">
            <div className="flex min-h-[2.75rem] multi-select-container rounded-lg border border-gray-300 py-1 pl-2 pr-2 shadow-theme-xs outline-hidden transition focus:border-brand-300 focus:shadow-focus-ring dark:border-gray-700 dark:focus:border-brand-300 overflow-hidden">
              <div className="flex flex-wrap items-center w-full gap-1">
                {selectedValuesText.length > 0 && (
                  selectedValuesText.map((text, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center justify-center rounded-full border-[0.7px] border-transparent bg-brand-100 py-0.5 pl-2 pr-1 my-0.5 multi-select-tag text-sm text-gray-800 hover:border-brand-200 dark:bg-brand-900/20 dark:text-white/90 dark:hover:border-brand-800 max-w-full"
                    >
                      <span className="truncate max-w-[160px]">{text}</span>
                      <div className="flex-shrink-0 flex ml-0.5">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            removeOption(selectedOptions[index]);
                          }}
                          className="pl-2 text-gray-500 cursor-pointer group-hover:text-gray-400 dark:text-gray-400"
                        >
                          <svg
                            className="fill-current"
                            role="button"
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M3.40717 4.46881C3.11428 4.17591 3.11428 3.70104 3.40717 3.40815C3.70006 3.11525 4.17494 3.11525 4.46783 3.40815L6.99943 5.93975L9.53095 3.40822C9.82385 3.11533 10.2987 3.11533 10.5916 3.40822C10.8845 3.70112 10.8845 4.17599 10.5916 4.46888L8.06009 7.00041L10.5916 9.53193C10.8845 9.82482 10.8845 10.2997 10.5916 10.5926C10.2987 10.8855 9.82385 10.8855 9.53095 10.5926L6.99943 8.06107L4.46783 10.5927C4.17494 10.8856 3.70006 10.8856 3.40717 10.5927C3.11428 10.2998 3.11428 9.8249 3.40717 9.53201L5.93877 7.00041L3.40717 4.46881Z"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <input
                  ref={inputRef}
                  placeholder={selectedValuesText.length > 0 ? "" : "Select option"}
                  className="flex-1 min-w-[60px] h-7 p-1 text-sm bg-transparent border-0 outline-hidden appearance-none placeholder:text-gray-500 focus:border-0 focus:outline-hidden focus:ring-0 dark:text-gray-300 dark:placeholder:text-gray-500"
                  readOnly={!allowFiltering}
                  value={filterText}
                  onChange={(e) => allowFiltering && setFilterText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => {
                    if (allowFiltering) {
                      e.stopPropagation();
                      setIsOpen(true);
                    }
                  }}
                />
              </div>
              <div className="flex-shrink-0 flex items-center ml-1">
                <button
                  type="button"
                  onClick={toggleDropdown}
                  className="w-5 h-5 text-gray-700 outline-hidden cursor-pointer focus:outline-hidden dark:text-gray-400"
                >
                  <svg
                    className={`stroke-current ${isOpen ? "rotate-180" : ""}`}
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4.79175 7.39551L10.0001 12.6038L15.2084 7.39551"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {isOpen && (
            <div
              className="absolute left-0 z-50 w-full max-h-60 overflow-y-auto bg-white rounded-lg shadow-lg mt-1 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col w-full">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, index) => (
                    <div
                      key={index}
                      className={`w-full cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-900/10 ${
                        index < filteredOptions.length - 1 ? "border-b border-gray-200 dark:border-gray-700" : ""
                      }`}
                      onClick={() => handleSelect(option.value)}
                    >
                      <div
                        className="relative flex w-full items-center p-2 pl-2"
                      >
                        <div className="mx-2 leading-6 text-gray-800 dark:text-white/90">
                          {option.text}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-gray-500 dark:text-gray-400">
                    {filterText ? "No matches found" : "All options selected"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiSelect;
