import React, { useEffect, useRef, useState } from 'react';

const GreenScreen = ({ videoUrl, onVideoEnd }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        let animationFrameId;

        const processFrame = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.paused || video.ended) return;

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const width = video.videoWidth;
            const height = video.videoHeight;

            // Match canvas size to video
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;

            // Draw original frame
            ctx.drawImage(video, 0, 0, width, height);
            
            // Get pixel data
            const frame = ctx.getImageData(0, 0, width, height);
            const l = frame.data.length / 4;

            for (let i = 0; i < l; i++) {
                const r = frame.data[i * 4 + 0];
                const g = frame.data[i * 4 + 1];
                const b = frame.data[i * 4 + 2];

                // Green Screen Logic: If pixel is predominantly green
                if (g > 100 && g > r * 1.4 && g > b * 1.4) {
                    frame.data[i * 4 + 3] = 0; // Set Alpha to 0 (Transparent)
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
        if(videoRef.current) {
            videoRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(e => {
                    console.error("Autoplay failed", e);
                    setError(true);
                });
        }
    };

    return (
        <div className="relative flex justify-center items-center w-full max-w-4xl h-[50vh] md:h-[70vh]">
            <video 
                ref={videoRef}
                src={videoUrl}
                className="hidden"
                muted
                playsInline
                crossOrigin="anonymous" 
                onLoadedData={handlePlay}
                onEnded={onVideoEnd}
            />

            {!error ? (
                <canvas ref={canvasRef} className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]" />
            ) : (
                <div className="text-center animate-pulse">
                        <h1 className="text-6xl md:text-9xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                        Onboardin Ai
                    </h1>
                </div>
            )}
        </div>
    );
};

export default GreenScreen;