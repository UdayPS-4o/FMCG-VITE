import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';

interface InputProps {
  id?: string;
  label?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  required?: boolean;
  className?: string;
  variant?: 'outlined' | 'underlined';
  error?: boolean | string;
  success?: boolean;
  disabled?: boolean;
  hint?: string;
  name?: string;
  autoComplete?: string;
  maxLength?: number;
  inputMode?: 'search' | 'text' | 'email' | 'tel' | 'numeric' | 'url' | 'none' | 'decimal';
  fieldType?: 'pan' | 'gstin' | 'default';
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

// Define handle types for the ref
export interface InputRefHandle {
  focus: () => void;
  blur: () => void;
}

const Input = forwardRef<InputRefHandle, InputProps>((
  {
    id,
    label = '',
    value = '',
    type = 'text',
    placeholder = ' ',
    onChange = () => {},
    onBlur,
    onFocus,
    required = false,
    className = '',
    variant = 'outlined',
    error = false,
    success = false,
    disabled = false,
    hint = '',
    name,
    autoComplete,
    maxLength,
    inputMode,
    fieldType = 'default',
    onKeyDown,
  }, 
  ref
) => {
  const [isFocused, setIsFocused] = useState(false);
  const internalInputRef = useRef<HTMLInputElement>(null);
  
  // Expose focus and blur methods via the ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      internalInputRef.current?.focus();
    },
    blur: () => {
      internalInputRef.current?.blur();
    }
  }));
  
  const isActive = isFocused || value;
  
  // Determine the appropriate inputMode based on current cursor position
  const getInputMode = () => {
    if (inputMode) return inputMode as 'search' | 'text' | 'email' | 'tel' | 'numeric' | 'url' | 'none' | 'decimal';
    
    if (fieldType === 'pan') {
      // First 5 chars are alphabetic, next 4 are numeric, last one is alphabetic
      const cursorPos = value.length;
      if (cursorPos < 5 || cursorPos === 9) return 'text';
      if (cursorPos >= 5 && cursorPos < 9) return 'numeric';
    }
    
    if (fieldType === 'gstin') {
      // Pattern: 2-numeric, 5-alpha, 4-numeric, 1-alpha, 1-numeric, 1-alpha, 1-alphanumeric
      const cursorPos = value.length;
      if (cursorPos < 2) return 'numeric';
      if (cursorPos >= 2 && cursorPos < 7) return 'text';
      if (cursorPos >= 7 && cursorPos < 11) return 'numeric';
      if (cursorPos === 11) return 'text';
      if (cursorPos === 12) return 'numeric';
      if (cursorPos === 13) return 'text';
      if (cursorPos === 14) return 'text'; // Alphanumeric, but text keyboard is better for last char
    }
    
    return type === 'tel' ? 'numeric' : 'text';
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e);
  };
  
  const handleFocus = () => {
    setIsFocused(true);
    if (onFocus) onFocus();
  };
  
  const handleBlur = () => {
    setIsFocused(false);
    if (onBlur) onBlur();
  };
  
  const getContainerClasses = () => {
    let baseClasses = 'relative transition-all duration-200';
    
    if (variant === 'outlined') {
      baseClasses += ' border rounded-lg';
      
      if (error) {
        baseClasses += ' border-red-500 dark:border-red-400';
      } else if (success) {
        baseClasses += ' border-green-500 dark:border-green-400';
      } else if (isActive) {
        baseClasses += ' border-brand-500 dark:border-brand-400';
      } else {
        baseClasses += ' border-gray-300 dark:border-gray-700';
      }
    } else {
      baseClasses += ' border-b';
      
      if (error) {
        baseClasses += ' border-red-500 dark:border-red-400';
      } else if (success) {
        baseClasses += ' border-green-500 dark:border-green-400';
      } else if (isActive) {
        baseClasses += ' border-brand-500 dark:border-brand-400';
      } else {
        baseClasses += ' border-gray-300 dark:border-gray-700';
      }
    }
    
    return baseClasses;
  };
  
  const getLabelClasses = () => {
    const baseClasses = 'absolute transition-all duration-200 pointer-events-none';
    
    let colorClasses = '';
    if (error) {
      colorClasses = 'text-red-500 dark:text-red-400';
    } else if (success) {
      colorClasses = 'text-green-500 dark:text-green-400';
    } else if (isActive) {
      colorClasses = 'text-brand-500 dark:text-brand-400';
    } else {
      colorClasses = 'text-gray-500 dark:text-gray-400';
    }
    
    if (variant === 'outlined') {
      return `${baseClasses} ${
        isActive 
          ? `text-xs -top-2 left-2 px-1 ${colorClasses} bg-white dark:bg-gray-900` 
          : `${colorClasses} top-1/2 -translate-y-1/2 left-4`
      }`;
    } else {
      return `${baseClasses} ${
        isActive 
          ? `text-xs -top-5 left-0 ${colorClasses}` 
          : `${colorClasses} top-1/2 -translate-y-1/2 left-0`
      }`;
    }
  };
  
  const getInputClasses = () => {
    let baseClasses = 'w-full bg-transparent text-gray-800 dark:text-white/90 focus:outline-none';
    
    if (disabled) {
      baseClasses += ' cursor-not-allowed opacity-60';
    }
    
    if (variant === 'outlined') {
      baseClasses += ' px-4 py-2.5 text-sm';
    } else {
      baseClasses += ' pb-2 pt-1 text-sm';
    }
    
    return baseClasses;
  };

  return (
    <div className="flex flex-col">
      <div className={`${getContainerClasses()} ${className}`}>
        <input
          ref={internalInputRef}
          id={id}
          type={type}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          className={getInputClasses()}
          onFocus={handleFocus}
          onBlur={handleBlur}
          name={name}
          maxLength={maxLength}
          inputMode={getInputMode()}
          onKeyDown={onKeyDown}
        />
        {label && (
          <label 
            htmlFor={id} 
            className={getLabelClasses()}
          >
            {label}
          </label>
        )}
      </div>
      
      {typeof error === 'string' && error ? (
        <div className="mt-1 text-xs text-red-500 dark:text-red-400">
          {error}
        </div>
      ) : hint && (
        <div className={`mt-1 text-xs ${
          error ? 'text-red-500 dark:text-red-400' : 
          success ? 'text-green-500 dark:text-green-400' : 
          'text-gray-500 dark:text-gray-400'
        }`}>
          {hint}
        </div>
      )}
    </div>
  );
});

export default Input; 