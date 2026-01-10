import React from 'react';
import { FAVICON_BASE64 } from './icon.base64.js';

const Logo = ({ 
  size = 16, 
  className = '', 
  style = {},
  onClick 
}) => {
  return (
    <img
      src={FAVICON_BASE64}
      alt="Logo"
      className={className}
      onClick={onClick}
      draggable={false}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'cover',
        display: 'block',
        ...style
      }}
    />
  );
};

export { FAVICON_BASE64 };
export default Logo;