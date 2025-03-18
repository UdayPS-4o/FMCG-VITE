import React from 'react';

interface ColProps {
  children: React.ReactNode;
  className?: string;
  md?: number;
  sm?: number;
  lg?: number;
}

const Col: React.FC<ColProps> = ({ 
  children, 
  className = '', 
  md, 
  sm, 
  lg 
}) => {
  const classes = [
    className,
    md ? `col-md-${md}` : '',
    sm ? `col-sm-${sm}` : '',
    lg ? `col-lg-${lg}` : '',
    !md && !sm && !lg ? 'col' : ''
  ].filter(Boolean).join(' ');

  return <div className={classes}>{children}</div>;
};

export default Col; 