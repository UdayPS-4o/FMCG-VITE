import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parse, format, isValid } from 'date-fns';

interface DatePickerProps {
  id: string;
  label: string;
  value: string; // Accepts 'YYYY-MM-DD' or 'DD-MM-YYYY'
  onChange: (dateString: string) => void; // Returns date in the same format as input 'value'
  dateFormatType?: 'yyyy-mm-dd' | 'dd-mm-yyyy'; // Controls input/output format
  variant?: 'outlined'; // Match existing Input style
  required?: boolean;
  className?: string;
  placeholderText?: string;
  name?: string; // Added name prop for form handling
  [key: string]: any; // Allow passing any additional props to ReactDatePicker
}

// Custom Popper Container using Portal
const PopperContainer = ({ children }: { children: React.ReactNode }) => {
  return createPortal(children, document.body);
};

const DatePicker: React.FC<DatePickerProps> = ({
  id,
  label,
  value,
  onChange,
  dateFormatType = 'yyyy-mm-dd', // Default to YYYY-MM-DD
  variant = 'outlined', // Default to outlined variant
  required,
  className = '',
  placeholderText = ' ', // Use space for floating label
  name, // Include name prop
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const displayDateFormat = dateFormatType === 'dd-mm-yyyy' ? 'dd-MM-yyyy' : 'yyyy-MM-dd';
  const outputFormat = displayDateFormat; // Keep output same as display/input format type

  // Parse the incoming value string into a Date object
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    // Try parsing with the specified display format first
    let parsedDate = parse(dateStr, displayDateFormat, new Date());
    // If invalid, try the other common format (helps if initial value is wrong format)
    if (!isValid(parsedDate)) {
        const alternativeFormat = displayDateFormat === 'dd-MM-yyyy' ? 'yyyy-MM-dd' : 'dd-MM-yyyy';
        parsedDate = parse(dateStr, alternativeFormat, new Date());
    }
    return isValid(parsedDate) ? parsedDate : null;
  };

  const selectedDate = parseDate(value);
  const isActive = isFocused || !!value; // Label is active if focused or has value

  const handleDateChange = (date: Date | null) => {
    if (date && isValid(date)) {
      onChange(format(date, outputFormat));
    } else {
      onChange(''); // Handle null/invalid date selection
    }
  };

  // Determine appropriate input classes based on variant
  const getInputClasses = () => {
    if (variant === 'outlined') {
      // Adjusted padding for floating label
      return "w-full px-4 py-2.5 text-sm bg-transparent border-none focus:outline-none focus:ring-0 dark:text-white/90 pr-10";
    }
    // Fallback or other variants
    return "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-brand-500 dark:focus:border-brand-500 sm:text-sm pr-10";
  };

  return (
    <div className={`relative ${className}`}>
      <div className={`relative border ${isActive ? 'border-brand-500 dark:border-brand-400' : 'border-gray-300 dark:border-gray-700'} rounded-lg transition-all duration-200`}>
        <ReactDatePicker
          id={id}
          name={name}
          selected={selectedDate}
          onChange={handleDateChange as any}
          onFocus={() => setIsFocused(true)} // Set focus state
          onBlur={() => setIsFocused(false)}  // Clear focus state
          dateFormat={displayDateFormat}
          className={getInputClasses()}
          placeholderText={placeholderText} // Use space placeholder
          showPopperArrow={false}
          popperPlacement="bottom-start"
          popperContainer={PopperContainer} // Use the custom portal container
          autoComplete="off"
          {...rest}
        />
        {/* Floating Label */}
        <label
          htmlFor={id}
          className={`absolute transition-all duration-200 pointer-events-none ${isActive
              ? 'text-xs -top-2 left-2 px-1 text-brand-500 dark:text-brand-400 bg-white dark:bg-gray-900' // Active state: Smaller, above border
              : 'text-gray-500 dark:text-gray-400 top-1/2 -translate-y-1/2 left-4' // Inactive state: Larger, centered inside
            }`}
        >
          {label} {required && !isActive && <span className="text-red-500">*</span>}
        </label>
        {/* Calendar icon */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>
      </div>

      {/* Custom styling for datepicker */}
      <style>{`
        .react-datepicker-wrapper {
          width: 100%;
          display: block;
        }
        .react-datepicker__input-container {
          width: 100%;
          display: block;
        }
        .react-datepicker__input-container input {
          width: 100%;
          box-sizing: border-box;
          /* padding-right adjusted inline */
        }
        /* Ensure input has no default border/outline */
        .react-datepicker__input-container input:focus {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .react-datepicker-popper {
          z-index: 999 !important;
        }
        .react-datepicker {
          font-size: 0.8rem;
          border-radius: 0.375rem;
          border: 1px solid #d1d5db;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .react-datepicker__header {
          background-color: #f3f4f6;
          border-bottom: 1px solid #e5e7eb;
          padding-top: 0.5rem;
        }
        .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker-year-header {
          color: #1f2937;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        .react-datepicker__month-container {
          padding: 0.5rem;
        }
        .react-datepicker__day-name {
          color: #4b5563;
          font-weight: 500;
          width: 1.9rem;
          line-height: 1.9rem;
          margin: 0.2rem;
        }
        .react-datepicker__day, .react-datepicker__time-name {
          width: 1.9rem;
          line-height: 1.9rem;
          margin: 0.2rem;
          border-radius: 0.375rem;
        }
        .react-datepicker__day--selected,
        .react-datepicker__day--in-selecting-range,
        .react-datepicker__day--in-range,
        .react-datepicker__month-text--selected,
        .react-datepicker__month-text--in-selecting-range,
        .react-datepicker__month-text--in-range,
        .react-datepicker__quarter-text--selected,
        .react-datepicker__quarter-text--in-selecting-range,
        .react-datepicker__quarter-text--in-range,
        .react-datepicker__year-text--selected,
        .react-datepicker__year-text--in-selecting-range,
        .react-datepicker__year-text--in-range {
          background-color: #4f46e5;
          color: white;
        }
        .react-datepicker__day--selected:hover,
        .react-datepicker__day--in-selecting-range:hover,
        .react-datepicker__day--in-range:hover,
        .react-datepicker__month-text--selected:hover,
        .react-datepicker__month-text--in-selecting-range:hover,
        .react-datepicker__month-text--in-range:hover,
        .react-datepicker__quarter-text--selected:hover,
        .react-datepicker__quarter-text--in-selecting-range:hover,
        .react-datepicker__quarter-text--in-range:hover,
        .react-datepicker__year-text--selected:hover,
        .react-datepicker__year-text--in-selecting-range:hover,
        .react-datepicker__year-text--in-range:hover {
          background-color: #4338ca;
        }
        .react-datepicker__day--keyboard-selected {
          background-color: #c7d2fe;
          color: #1f2937;
        }
        .react-datepicker__day--today {
          font-weight: bold;
          border: 1px solid #4f46e5;
          color: #4f46e5;
          background-color: transparent;
        }
        .react-datepicker__day--today:hover {
          background-color: #e0e7ff;
        }
        .react-datepicker__day:hover {
          background-color: #e0e7ff;
          color: #1f2937;
        }
        .react-datepicker__day--outside-month {
          color: #9ca3af;
        }
        .react-datepicker__navigation {
          top: 0.6rem;
        }

        /* Dark mode styles */
        .dark .react-datepicker {
          background-color: #1f2937;
          border-color: #4b5563;
        }
        .dark .react-datepicker__header {
          background-color: #374151;
          border-bottom-color: #4b5563;
        }
        .dark .react-datepicker__current-month {
          color: #d1d5db;
        }
        .dark .react-datepicker__day-name {
          color: #9ca3af;
        }
        .dark .react-datepicker__day {
          color: #d1d5db;
        }
        .dark .react-datepicker__day:hover {
          background-color: #4b5563;
          color: #f9fafb;
        }
        .dark .react-datepicker__day--disabled,
        .dark .react-datepicker__day--outside-month {
          color: #6b7280;
        }
        .dark .react-datepicker__day--today {
          border-color: #6366f1;
          color: #818cf8;
        }
        .dark .react-datepicker__day--selected,
        .dark .react-datepicker__day--in-selecting-range,
        .dark .react-datepicker__day--in-range {
          background-color: #6366f1;
          color: #f9fafb;
        }
        .dark .react-datepicker__day--selected:hover,
        .dark .react-datepicker__day--in-selecting-range:hover,
        .dark .react-datepicker__day--in-range:hover {
          background-color: #4f46e5;
        }
        .dark .react-datepicker__navigation-icon::before {
          border-color: #9ca3af;
        }
        .dark .react-datepicker__navigation:hover .react-datepicker__navigation-icon::before {
          border-color: #d1d5db;
        }
      `}</style>
    </div>
  );
};

export default DatePicker; 