import { useState, type ImgHTMLAttributes } from 'react';

/** Product photo that fades in from a soft blur once loaded (instead of popping in). */
const FadeImg = ({ style, className, onLoad, ...rest }: ImgHTMLAttributes<HTMLImageElement>) => {
    const [loaded, setLoaded] = useState(false);
    return (
        <img
            {...rest}
            loading="lazy"
            className={className}
            onLoad={(e) => { setLoaded(true); onLoad?.(e); }}
            style={{
                ...style,
                opacity: loaded ? 1 : 0,
                filter: loaded ? 'none' : 'blur(8px)',
                transform: `${style?.transform ?? ''} ${loaded ? '' : 'scale(.92)'}`.trim() || undefined,
                transition: 'opacity .45s ease, filter .55s ease, transform .55s ease',
            }}
        />
    );
};

export default FadeImg;
