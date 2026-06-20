import React, { useEffect, useRef, useState } from 'react';

const LOGO_PNG = '/Onboardin.png';
const LOGO_SVG = '/favicon.svg';

const GreenScreen = ({ videoUrl, onVideoEnd }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [useLogo, setUseLogo] = useState(false);
    const [logoEntered, setLogoEntered] = useState(false);

    const failToLogo = () => setUseLogo(true);

    useEffect(() => {
        if (!useLogo) {
            setLogoEntered(false);
            return;
        }
        const id = requestAnimationFrame(() => setLogoEntered(true));
        return () => cancelAnimationFrame(id);
    }, [useLogo]);

    useEffect(() => {
        let animationFrameId;

        const processFrame = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.paused || video.ended) return;

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const width = video.videoWidth;
            const height = video.videoHeight;

            const cropRight = 0.0;
            const sourceWidth = width * (1 - cropRight);

            if (canvas.width !== sourceWidth) canvas.width = sourceWidth;
            if (canvas.height !== height) canvas.height = height;

            ctx.drawImage(video, 0, 0, sourceWidth, height, 0, 0, sourceWidth, height);

            const frame = ctx.getImageData(0, 0, sourceWidth, height);
            const data = frame.data;

            const similarityThreshold = 0.4;
            const smoothnessThreshold = 0.08;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i + 0];
                const g = data[i + 1];
                const b = data[i + 2];

                const maxRB = Math.max(r, b);
                const greenness = (g - maxRB) / 255;

                if (greenness > similarityThreshold) {
                    const diff = greenness - similarityThreshold;
                    if (diff < smoothnessThreshold) {
                        const alpha = 1 - (diff / smoothnessThreshold);
                        data[i + 3] = alpha * 255;
                    } else {
                        data[i + 3] = 0;
                    }
                }
            }

            ctx.putImageData(frame, 0, 0);
            animationFrameId = requestAnimationFrame(processFrame);
        };

        if (isPlaying) {
            processFrame();
        }

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying]);

    const handlePlay = () => {
        if (videoRef.current) {
            videoRef.current.play()
                .then(() => setIsPlaying(true))
                .catch((e) => {
                    console.error('Autoplay failed', e);
                    failToLogo();
                });
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isPlaying) failToLogo();
        }, 2000);
        return () => clearTimeout(timer);
    }, [isPlaying]);

    return (
        <div className="relative flex justify-center items-center w-full max-w-2xl h-[40vh] md:h-[50vh]">
            {useLogo ? (
                <img
                    src={LOGO_PNG}
                    alt="Onboardin"
                    className={`w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-[1500ms] ease-out ${
                        logoEntered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    onError={(e) => {
                        if (!e.currentTarget.src.endsWith('favicon.svg')) e.currentTarget.src = LOGO_SVG;
                    }}
                />
            ) : (
                <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-opacity duration-700"
                    style={{ opacity: isPlaying ? 1 : 0 }}
                />
            )}
            <video
                ref={videoRef}
                src={videoUrl}
                className="hidden"
                muted
                playsInline
                crossOrigin="anonymous"
                onLoadedData={handlePlay}
                onEnded={onVideoEnd}
                onError={failToLogo}
            />
        </div>
    );
};

export default GreenScreen;