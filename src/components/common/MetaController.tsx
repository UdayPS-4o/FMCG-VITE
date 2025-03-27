import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const MetaController = () => {
  const location = useLocation();
  const isPrintPage = location.pathname.includes('/print') || location.pathname.includes('/printInvoice');
  
  useEffect(() => {
    // Get the existing viewport meta tag
    let metaViewport = document.querySelector('meta[name="viewport"]');
    
    // If it doesn't exist, create it
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.setAttribute('name', 'viewport');
      document.head.appendChild(metaViewport);
    }
    
    // Set content based on whether it's a print page or not
    if (isPrintPage) {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    } else {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
    
    return () => {
      // Clean up if needed
    };
  }, [isPrintPage]);
  
  return null;
};

export default MetaController; 