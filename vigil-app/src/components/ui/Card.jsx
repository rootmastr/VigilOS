import React from 'react';

const Card = ({
  children,
  className = '',
  padding = true,
  hover = false,
  onClick,
  header,
  footer,
  ...props
}) => {
  const baseClasses = 'bg-white rounded-lg shadow-md border border-gray-200';
  const paddingClasses = padding ? 'p-4' : '';
  const hoverClasses = hover ? 'hover:shadow-lg transition-shadow cursor-pointer' : '';

  return (
    <div
      className={`${baseClasses} ${paddingClasses} ${hoverClasses} ${className}`}
      onClick={onClick}
      {...props}
    >
      {header && (
        <div className="border-b border-gray-200 pb-3 mb-3">
          {header}
        </div>
      )}
      {children}
      {footer && (
        <div className="border-t border-gray-200 pt-3 mt-3">
          {footer}
        </div>
      )}
    </div>
  );
};

export const CardHeader = ({ children, className = '' }) => (
  <div className={`font-semibold text-gray-800 ${className}`}>
    {children}
  </div>
);

export const CardContent = ({ children, className = '' }) => (
  <div className={`${className}`}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '' }) => (
  <div className={`flex justify-end space-x-2 ${className}`}>
    {children}
  </div>
);

export default Card;
