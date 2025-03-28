import React, { useState } from 'react';

interface InputProps {
  id?: string;
  label?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  className?: string;
  variant?: 'outlined' | 'underlined';
  error?: boolean;
  success?: boolean;
  disabled?: boolean;
  hint?: string;
  name?: string;
  autoComplete?: string;
  maxLength?: number;
}

const Input: React.FC<InputProps> = ({
  id,
  label = '',
  value = '',
  type = 'text',
  placeholder = ' ',
  onChange = () => {},
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
}) => {
  const [isFocused, setIsFocused] = useState(false);
  
  const isActive = isFocused || value;
  
  // Different styles based on variant and state
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
    <div className={`${getContainerClasses()} ${className}`}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className={getInputClasses()}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        name={name}
        maxLength={maxLength}
      />
      {label && (
        <label 
          htmlFor={id} 
          className={getLabelClasses()}
        >
          {label}
        </label>
      )}
      
      {hint && (
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
};

export default Input; 