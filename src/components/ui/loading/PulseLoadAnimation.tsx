import React from 'react';

interface PulseLoadAnimationProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PulseLoadAnimation: React.FC<PulseLoadAnimationProps> = ({ 
  size = 'md', 
  className = '' 
}) => {
  // Size configurations
  const sizeConfig = {
    sm: {
    container: 'w-26 h-28',
      logo: 'w-20 h-10',
      dots: 'w-1.5 h-1.5',
      dotsContainer: 'gap-1 mt-3'
    },
    md: {
      container: 'w-28 h-32',
      logo: 'w-24 h-12',
      dots: 'w-2 h-2',
      dotsContainer: 'gap-1.5 mt-4'
    },
    lg: {
      container: 'w-36 h-40',
      logo: 'w-32 h-16',
      dots: 'w-3 h-3',
      dotsContainer: 'gap-2 mt-5'
    }
  };

  const config = sizeConfig[size];

  return (
    <>
      {/* Custom CSS for animations */}
      <style>{`
        @keyframes pulse-breath {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.8;
          }
        }

        @keyframes bounce-dot {
          0%, 80%, 100% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          40% {
            transform: scale(1.2);
            opacity: 1;
          }
        }

        .animate-pulse-breath {
          animation: pulse-breath 2s ease-in-out infinite;
        }

        .animate-bounce-dot-1 {
          animation: bounce-dot 1.4s ease-in-out infinite;
        }

        .animate-bounce-dot-2 {
          animation: bounce-dot 1.4s ease-in-out infinite 0.2s;
        }

        .animate-bounce-dot-3 {
          animation: bounce-dot 1.4s ease-in-out infinite 0.4s;
        }
      `}</style>

      <div className={`flex flex-col items-center justify-center ${config.container} ${className}`}>
        {/* Breathing Logo */}
        <div className="relative flex items-center justify-center">
          {/* Pulse ring effects */}
          <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping"></div>
          <div className="absolute inset-0 rounded-full bg-brand-500/10 animate-pulse"></div>
          
          {/* Logo with breathing animation */}
          <div className={`relative ${config.logo} animate-pulse-breath`}>
            <img
              src="./images/logo/logo.svg"
              alt="Loading..."
              className="w-full h-full object-contain dark:hidden"
            />
            <img
              src="./images/logo/logo-dark.svg"
              alt="Loading..."
              className="w-full h-full object-contain hidden dark:block"
            />
          </div>
        </div>

        {/* Cycling Dots */}
        <div className={`flex items-center ${config.dotsContainer}`}>
          <div className={`${config.dots} bg-brand-500 rounded-full animate-bounce-dot-1`}></div>
          <div className={`${config.dots} bg-brand-500 rounded-full animate-bounce-dot-2`}></div>
          <div className={`${config.dots} bg-brand-500 rounded-full animate-bounce-dot-3`}></div>
        </div>
      </div>
    </>
  );
};

export default PulseLoadAnimation;