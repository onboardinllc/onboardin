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

            // Define crop area to remove "Ai" from the top right
            // We reduce the source width slightly to cut off the right side
            const cropRight = 0.0; // Percent to cut from right (adjust this to trim "Ai")
            const sourceWidth = width * (1 - cropRight);
            
            if (canvas.width !== sourceWidth) canvas.width = sourceWidth;
            if (canvas.height !== height) canvas.height = height;

            // Draw the cropped video frame
            ctx.drawImage(video, 0, 0, sourceWidth, height, 0, 0, sourceWidth, height);
            
            const frame = ctx.getImageData(0, 0, sourceWidth, height);
            const data = frame.data;

            // Chroma Key Settings for Smoothing
            const similarityThreshold = 0.4; // How close to green to start fading
            const smoothnessThreshold = 0.08; // The range over which we fade alpha

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i + 0];
                const g = data[i + 1];
                const b = data[i + 2];

                // Calculate "Greenness" relative to other channels
                const maxRB = Math.max(r, b);
                const greenness = (g - maxRB) / 255;

                if (greenness > similarityThreshold) {
                    // Calculate soft alpha based on similarity
                    const diff = greenness - similarityThreshold;
                    if (diff < smoothnessThreshold) {
                        // Blend edge pixels for smoothness
                        const alpha = 1 - (diff / smoothnessThreshold);
                        data[i + 3] = alpha * 255;
                    } else {
                        // Fully transparent
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
        <div className="relative flex justify-center items-center w-full max-w-2xl h-[40vh] md:h-[50vh]">
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
                <canvas 
                    ref={canvasRef} 
                    className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-700" 
                />
            ) : (
                <div className="text-center animate-pulse">
                     <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                        Onboardin
                    </h1>
                </div>
            )}
        </div>
    );
};

export default GreenScreen;