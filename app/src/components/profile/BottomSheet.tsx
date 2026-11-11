import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/** Slide-up panel used by the Profile page (same look as its Pay sheet). */
const BottomSheet = ({ open, title, onClose, children }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
}) => (
    <AnimatePresence>
        {open && (
            <>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/40 z-[999]"
                />
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 pb-8 z-[1000] shadow-[0_-4px_20px_rgba(0,0,0,0.1)] max-h-[85vh] overflow-y-auto"
                >
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                        <button onClick={onClose} aria-label="Close" className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                    {children}
                </motion.div>
            </>
        )}
    </AnimatePresence>
);

export default BottomSheet;
